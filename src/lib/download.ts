import { saveTrackToDB, SavedTrack, getTrackFromDB } from "./db";
import { addSongToLibrary } from "./syncLibrary";



export interface ItunesTrack {
    trackId: number;
    artistName: string;
    trackName: string;
    collectionName: string;
    artworkUrl100: string;
    previewUrl: string;
    trackNumber?: number;
    trackTimeMillis?: number;
    trackCount?: number;
    releaseDate?: string;
}

async function fetchWithChunks(
    url: string,
    controller: AbortController,
    onProgress?: (progress: number) => void
): Promise<{ blob: Blob, headers: Headers }> {
    const chunks: Uint8Array[] = [];
    let downloadedBytes = 0;
    let totalBytes = 0;
    let contentType = "audio/mpeg";
    let firstHeaders: Headers | null = null;

    while (true) {
        const start = downloadedBytes;
        const res = await fetch(url, {
            headers: { 'Range': `bytes=${start}-` },
            signal: controller.signal
        });

        if (!res.ok) {
            let apiError = `HTTP ${res.status}`;
            let extractedTitle = "";
            let extractedArtist = "";
            try {
                const errData = await res.json();
                if (errData.error) apiError = errData.error;
                if (errData.title) extractedTitle = errData.title;
                if (errData.artist) extractedArtist = errData.artist;
            } catch { }
            const error = new Error(`API error: ${apiError}`);
            (error as any).extractedTitle = extractedTitle;
            (error as any).extractedArtist = extractedArtist;
            throw error;
        }

        if (!firstHeaders) firstHeaders = res.headers;

        contentType = res.headers.get("Content-Type") || contentType;

        if (contentType.includes("application/json") && downloadedBytes === 0) {
            const data = await res.json();
            if (data.audioUrl) {
                url = data.audioUrl;
                firstHeaders = null;
                continue;
            } else if (data.error) {
                throw new Error(`API: ${data.error}`);
            } else {
                throw new Error("Respuesta JSON inválida del servidor");
            }
        }

        const contentRange = res.headers.get("Content-Range");
        if (contentRange) {
            totalBytes = parseInt(contentRange.split("/")[1], 10);
        } else if (!totalBytes) {
            totalBytes = parseInt(res.headers.get("Content-Length") || "0", 10);
        }

        const buffer = await res.arrayBuffer();
        chunks.push(new Uint8Array(buffer));
        downloadedBytes += buffer.byteLength;

        if (totalBytes > 0 && onProgress) {
            onProgress(Math.min(99, Math.round((downloadedBytes / totalBytes) * 95)));
        }

        if (!contentRange || downloadedBytes >= totalBytes) {
            break;
        }
    }

    return { blob: new Blob(chunks as unknown as BlobPart[], { type: contentType }), headers: firstHeaders! };
}

async function processResolvedBlob(
    blob: Blob,
    headers: Headers,
    track: ItunesTrack | null,
    url: string | null,
    id: string,
    prefetchedMeta?: { title?: string; artist?: string; cover?: string }
): Promise<boolean> {
    let resolvedTitle = track?.trackName || "Enlace Descargado";
    let resolvedArtist = track?.artistName || "Desconocido";
    let resolvedCover = track?.artworkUrl100?.replace("100x100", "500x500") || "";

    if (!track) {
        console.log("[Download] Processing blob headers:", Array.from(headers.entries()));
        const headerTitle = headers.get("x-video-title");
        const headerArtist = headers.get("x-video-artist");
        const headerCover = headers.get("x-video-cover");

        if (headerTitle) resolvedTitle = decodeURIComponent(headerTitle);
        if (headerArtist) resolvedArtist = decodeURIComponent(headerArtist);
        if (headerCover) resolvedCover = headerCover;

        if (prefetchedMeta?.title && prefetchedMeta.title !== "Enlace Descargado") {
            resolvedTitle = prefetchedMeta.title;
            if (prefetchedMeta.artist) resolvedArtist = prefetchedMeta.artist;
            if (prefetchedMeta.cover) resolvedCover = prefetchedMeta.cover;
        }
        console.log(`[Download] Extracted Metadata: Title=${resolvedTitle}, Artist=${resolvedArtist}, Cover=${resolvedCover}`);
    }

    let streamUrl = "";
    if (track) {
        streamUrl = `https://caleta-music.vercel.app/api/deezer/?title=${encodeURIComponent(resolvedTitle)}&artist=${encodeURIComponent(resolvedArtist)}`;
    } else if (url) {
        streamUrl = `https://caleta-music.vercel.app/api/youtube-resolve?id=${url.match(/(?:v=|\/|youtu\.be\/)([0-9A-Za-z_-]{11})/)?.[1] || ""}`;
    }

    const trackData = {
        id,
        title: resolvedTitle,
        artist: resolvedArtist,
        album: track?.collectionName || "",
        coverUrl: resolvedCover,
        streamUrl,
    };

    await addSongToLibrary(trackData, streamUrl, blob);
    return true;
}

export interface DownloadResult {
    success: boolean;
    error?: string;
}

/**
 * ═══════════════════════════════════════════════════════════════════
 * MAIN DOWNLOAD FUNCTION
 * 
 * Architecture for YouTube URLs (eliminates datacenter IP blocking):
 *   1. Browser → Vercel /api/youtube-resolve (lightweight, only talks to Invidious API)
 *   2. Vercel returns Invidious `local=true` audio URL + metadata
 *   3. Browser fetches audio DIRECTLY from Invidious (residential proxy)
 *   4. YouTube never sees a datacenter IP!
 * 
 * Architecture for Track-based downloads:
 *   1. Browser → Vercel /api/deezer (Deezer streaming)
 * ═══════════════════════════════════════════════════════════════════
 */
export const downloadAndSaveTrack = async (
    track: ItunesTrack | null,
    url: string | null,
    id: string,
    onProgress?: (progress: number) => void,
    onComplete?: () => void
): Promise<DownloadResult> => {
    try {
        // Prevent duplicate downloads
        const existingTrack = await getTrackFromDB(id);
        if (existingTrack && existingTrack.blob !== undefined) {
            return { success: false, error: "Esta canción ya está descargada en tu biblioteca." };
        }

        let isNative = false;
        try { const { Capacitor } = require('@capacitor/core'); isNative = Capacitor.isNativePlatform(); } catch { }

        const VERCEL_API = "https://caleta-music.vercel.app";
        const runtimeApiBase = isNative ? VERCEL_API : "";

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 120000);

        let fakeProgressInterval: NodeJS.Timeout | null = null;
        if (onProgress) {
            let fp = 0;
            fakeProgressInterval = setInterval(() => {
                if (fp < 90) {
                    fp += Math.random() * 4 + 1;
                    if (fp > 90) fp = 90;
                    onProgress(Math.floor(fp));
                }
            }, 600);
        }

        const cleanup = () => {
            clearTimeout(timeout);
            if (fakeProgressInterval) clearInterval(fakeProgressInterval);
        };

        // ═══════════════════════════════════════════════════
        // PATH A: Track-based download (iTunes/Deezer)
        // ═══════════════════════════════════════════════════
        if (track) {
            let downloadUrl = "";
            if ((track as any)._source === 'deezer' && track.trackId) {
                downloadUrl = `${runtimeApiBase}/api/deezer/?id=${track.trackId}`;
            } else {
                downloadUrl = `${runtimeApiBase}/api/deezer/?title=${encodeURIComponent(track.trackName)}&artist=${encodeURIComponent(track.artistName)}`;
            }

            try {
                const { blob, headers } = await fetchWithChunks(downloadUrl, controller, onProgress);
                cleanup();
                await processResolvedBlob(blob, headers, track, url, id);
                if (onComplete) onComplete();
                return { success: true };
            } catch (dzErr: any) {
                cleanup();
                return { success: false, error: dzErr?.message || "Error desconocido" };
            }
        }

        // ═══════════════════════════════════════════════════
        // PATH B: YouTube URL → Telegram Bot (@BotYouTubeMusicBot)
        // ═══════════════════════════════════════════════════
        if (url) {
            const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');

            if (isYouTube) {
                const videoIdMatch = url.match(/(?:v=|\/|youtu\.be\/)([0-9A-Za-z_-]{11})/);
                const videoId = videoIdMatch ? videoIdMatch[1] : null;

                if (!videoId) {
                    cleanup();
                    return { success: false, error: "No se pudo extraer el ID del video de YouTube" };
                }

                console.log(`[Download] YouTube detectado. VideoId: ${videoId}. Usando Telegram Bot...`);

                // Obtener título básico via noembed mientras descarga
                let resolvedTitle = "Enlace Descargado";
                let resolvedArtist = "YouTube";
                const resolvedCover = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

                try {
                    const embedRes = await fetch(
                        `https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`,
                        { signal: AbortSignal.timeout(4000) }
                    );
                    if (embedRes.ok) {
                        const embedData = await embedRes.json();
                        if (embedData.title) resolvedTitle = embedData.title;
                        if (embedData.author_name) resolvedArtist = embedData.author_name;
                    }
                } catch { }

                if (onProgress) onProgress(10);

                // ── Llamar al endpoint /api/telegram-download ──
                // El servidor usa GramJS para enviar el link al @BotYouTubeMusicBot
                // y espera la respuesta de audio (hasta 52 segs)
                try {
                    console.log(`[Download] Enviando a Telegram Bot...`);
                    const telegramUrl = `${runtimeApiBase}/api/telegram-download?url=${encodeURIComponent(url)}`;

                    const telegramRes = await fetch(telegramUrl, {
                        signal: AbortSignal.timeout(58000) // 58s timeout
                    });

                    if (!telegramRes.ok) {
                        let errMsg = `HTTP ${telegramRes.status}`;
                        try {
                            const errData = await telegramRes.json();
                            if (errData.error) errMsg = errData.error;
                        } catch { }
                        throw new Error(errMsg);
                    }

                    if (onProgress) onProgress(70);

                    const audioBlob = await telegramRes.blob();
                    if (onProgress) onProgress(90);

                    // Priorizar metadatos que vienen del bot de Telegram
                    const headerTitle = telegramRes.headers.get("x-video-title");
                    const headerArtist = telegramRes.headers.get("x-video-artist");
                    if (headerTitle) resolvedTitle = decodeURIComponent(headerTitle);
                    if (headerArtist) resolvedArtist = decodeURIComponent(headerArtist);

                    const metaHeaders = new Headers();
                    metaHeaders.set("x-video-title", encodeURIComponent(resolvedTitle));
                    metaHeaders.set("x-video-artist", encodeURIComponent(resolvedArtist));
                    metaHeaders.set("x-video-cover", resolvedCover);

                    cleanup();
                    await processResolvedBlob(audioBlob, metaHeaders, null, url, id, {
                        title: resolvedTitle,
                        artist: resolvedArtist,
                        cover: resolvedCover
                    });
                    if (onComplete) onComplete();
                    return { success: true };
                } catch (tgErr: any) {
                    console.warn(`[Download] Telegram Bot falló: ${tgErr.message}`);
                    cleanup();
                    return { success: false, error: `Error descargando via Telegram: ${tgErr.message}` };
                }
            }

            // Non-YouTube URL: direct fetch
            try {
                const { blob, headers } = await fetchWithChunks(url, controller, onProgress);
                cleanup();
                await processResolvedBlob(blob, headers, null, url, id);
                if (onComplete) onComplete();
                return { success: true };
            } catch (err: any) {
                cleanup();
                return { success: false, error: err.message || "Error descargando URL" };
            }
        }

        return { success: false, error: "No se proporcionó canción ni URL" };
    } catch (error: any) {
        const msg = error?.name === 'AbortError'
            ? "Timeout: la descarga tardó más de 2 minutos"
            : error?.message || "Error desconocido";
        console.error("[Download] Fatal:", msg);
        return { success: false, error: msg };
    }
};

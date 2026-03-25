import { saveTrackToDB, SavedTrack } from "./db";
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
            // Intentar extraer mensaje de error del API
            let apiError = `HTTP ${res.status}`;
            try {
                const errData = await res.json();
                if (errData.error) apiError = errData.error;
            } catch { /* no es JSON */ }
            throw new Error(`API error: ${apiError}`);
        }

        if (!firstHeaders) firstHeaders = res.headers;

        contentType = res.headers.get("Content-Type") || contentType;

        // Vercel fallback: if JSON is returned with audioUrl, we must fetch from that URL instead
        if (contentType.includes("application/json") && downloadedBytes === 0) {
            const data = await res.json();
            if (data.audioUrl) {
                // Restart process using the direct audio URL
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

        // Break if server didn't return chunked, or we reached the end
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
    id: string
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
        console.log(`[Download] Extracted Metadata: Title=${resolvedTitle}, Artist=${resolvedArtist}, Cover=${resolvedCover}`);
    }

    const trackData = {
        id,
        title: resolvedTitle,
        artist: resolvedArtist,
        album: track?.collectionName || "",
        coverUrl: resolvedCover,
    };

    const sourceUrlToSave = url || (track
        ? `https://itunes.apple.com/search?term=${encodeURIComponent(track.trackName + " " + track.artistName)}`
        : "");

    await addSongToLibrary(trackData, sourceUrlToSave, blob);
    return true;
}

export interface DownloadResult {
    success: boolean;
    error?: string;
}

export const downloadAndSaveTrack = async (
    track: ItunesTrack | null,
    url: string | null,
    id: string,
    onProgress?: (progress: number) => void,
    onComplete?: () => void
): Promise<DownloadResult> => {
    try {
        // Use absolute URL for Native Capacitor (Android) since it cannot resolve relative paths,
        // otherwise use relative "" to hit the same server (works on localhost, Wi-Fi PWA, and Prod).
        let isNative = false;
        try { const { Capacitor } = require('@capacitor/core'); isNative = Capacitor.isNativePlatform(); } catch { }

        const runtimeApiBase = isNative ? "https://caleta-music-production.up.railway.app" : "";
        let downloadUrl = "";

        if (track) {
            if ((track as any)._source === 'deezer' && track.trackId) {
                downloadUrl = `${runtimeApiBase}/api/deezer?id=${track.trackId}`;
            } else {
                downloadUrl = `${runtimeApiBase}/api/deezer?title=${encodeURIComponent(track.trackName)}&artist=${encodeURIComponent(track.artistName)}`;
            }
        } else if (url) {
            downloadUrl = `${runtimeApiBase}/api/download?url=${encodeURIComponent(url)}`;
        } else {
            return { success: false, error: "No se proporcionó canción ni URL" };
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 120000); // 2 mins total

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

        let deezerError = "";

        try {
            const { blob, headers } = await fetchWithChunks(downloadUrl, controller, onProgress);
            clearTimeout(timeout);
            if (fakeProgressInterval) clearInterval(fakeProgressInterval);

            await processResolvedBlob(blob, headers, track, url, id);
            if (onComplete) onComplete();
            return { success: true };
        } catch (downloadErr: any) {
            clearTimeout(timeout);
            if (fakeProgressInterval) clearInterval(fakeProgressInterval);
            deezerError = downloadErr?.message || "Error desconocido";

            // 1. Si era Deezer el primer intento, vamos a YouTube
            if (downloadUrl.includes('/api/deezer') && track) {
                console.warn(`[Download] Deezer failed (${deezerError}), trying YouTube...`);
                if (onProgress) onProgress(30);

                try {
                    const fallbackUrl = `${runtimeApiBase}/api/download?title=${encodeURIComponent(track.trackName)}&artist=${encodeURIComponent(track.artistName)}`;
                    const { blob, headers } = await fetchWithChunks(fallbackUrl, controller, onProgress);

                    await processResolvedBlob(blob, headers, track, url, id);
                    if (onComplete) onComplete();
                    return { success: true };
                } catch (ytErr: any) {
                    const ytError = ytErr?.message || "Error desconocido";
                    console.error(`[Download] YouTube also failed: ${ytError}`);
                    return {
                        success: false,
                        error: `Deezer: ${deezerError} | YouTube: ${ytError}`
                    };
                }
            }
            // 2. Si era YouTube el primer intento, vamos a Deezer 
            else if (downloadUrl.includes('/api/download') && track) {
                console.warn(`[Download] YouTube failed (${deezerError}), trying Deezer...`);
                if (onProgress) onProgress(30);

                try {
                    const dzFallbackUrl = `${runtimeApiBase}/api/deezer?title=${encodeURIComponent(track.trackName)}&artist=${encodeURIComponent(track.artistName)}`;
                    const { blob, headers } = await fetchWithChunks(dzFallbackUrl, controller, onProgress);

                    await processResolvedBlob(blob, headers, track, url, id);
                    if (onComplete) onComplete();
                    return { success: true };
                } catch (dzErr: any) {
                    const dzError = dzErr?.message || "Error desconocido";
                    console.error(`[Download] Deezer also failed: ${dzError}`);
                    return {
                        success: false,
                        error: `YouTube: ${deezerError} | Deezer: ${dzError}`
                    };
                }
            } else {
                return { success: false, error: deezerError };
            }
        }
    } catch (error: any) {
        const msg = error?.name === 'AbortError'
            ? "Timeout: la descarga tardó más de 2 minutos"
            : error?.message || "Error desconocido";
        console.error("[Download] Fatal:", msg);
        return { success: false, error: msg };
    }
};

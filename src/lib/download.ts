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

/**
 * Procesa el response de descarga: lee el stream, crea blob, guarda en biblioteca.
 */
async function processDownloadResponse(
    response: Response,
    track: ItunesTrack | null,
    url: string | null,
    id: string,
    onProgress?: (progress: number) => void,
    onComplete?: () => void
): Promise<boolean> {
    const contentLength = response.headers.get("Content-Length");
    const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;
    let loadedBytes = 0;

    const reader = response.body?.getReader();
    if (!reader) throw new Error("Stream no disponible");

    const chunks: Uint8Array[] = [];
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
            chunks.push(value);
            loadedBytes += value.length;
            if (totalBytes > 0 && onProgress) {
                const realProgress = (loadedBytes / totalBytes) * 10;
                onProgress(Math.min(100, Math.round(90 + realProgress)));
            } else if (onProgress) {
                onProgress(95);
            }
        }
    }

    if (onProgress) onProgress(100);

    const blob = new Blob(chunks as unknown as BlobPart[], {
        type: response.headers.get("Content-Type") || "audio/mpeg"
    });

    let resolvedTitle = track?.trackName || "Enlace Descargado";
    let resolvedArtist = track?.artistName || "Desconocido";
    let resolvedCover = track?.artworkUrl100?.replace("100x100", "500x500") || "";

    if (!track) {
        const headerTitle = response.headers.get("X-Video-Title");
        const headerArtist = response.headers.get("X-Video-Artist");
        const headerCover = response.headers.get("X-Video-Cover");
        if (headerTitle) resolvedTitle = decodeURIComponent(headerTitle);
        if (headerArtist) resolvedArtist = decodeURIComponent(headerArtist);
        if (headerCover) resolvedCover = headerCover;
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

    if (onComplete) onComplete();
    return true;
}

/**
 * Descarga audio directamente desde una URL (usado cuando la API devuelve 
 * una URL directa en JSON en vez de audio binario).
 */
async function downloadFromDirectUrl(
    audioUrl: string,
    metadata: { title: string; artist: string; coverUrl: string },
    track: ItunesTrack | null,
    url: string | null,
    id: string,
    onProgress?: (progress: number) => void,
    onComplete?: () => void
): Promise<boolean> {
    if (onProgress) onProgress(50);

    console.log("[Download] Fetching audio from direct URL...");
    const audioRes = await fetch(audioUrl);

    if (!audioRes.ok || !audioRes.body) {
        throw new Error("Failed to fetch audio from direct URL");
    }

    // Leer el audio
    const reader = audioRes.body.getReader();
    const chunks: Uint8Array[] = [];
    const totalBytes = parseInt(audioRes.headers.get("Content-Length") || "0", 10);
    let loadedBytes = 0;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
            chunks.push(value);
            loadedBytes += value.length;
            if (totalBytes > 0 && onProgress) {
                onProgress(Math.min(99, Math.round(50 + (loadedBytes / totalBytes) * 50)));
            } else if (onProgress) {
                onProgress(85);
            }
        }
    }

    if (onProgress) onProgress(100);

    const blob = new Blob(chunks as unknown as BlobPart[], {
        type: audioRes.headers.get("Content-Type") || "audio/mp4"
    });

    if (blob.size < 10000) {
        throw new Error("Downloaded audio too small: " + blob.size + " bytes");
    }

    const trackData = {
        id,
        title: metadata.title || track?.trackName || "Enlace Descargado",
        artist: metadata.artist || track?.artistName || "Desconocido",
        album: track?.collectionName || "",
        coverUrl: metadata.coverUrl || track?.artworkUrl100?.replace("100x100", "500x500") || "",
    };

    const sourceUrlToSave = url || (track
        ? `https://itunes.apple.com/search?term=${encodeURIComponent(track.trackName + " " + track.artistName)}`
        : "");

    await addSongToLibrary(trackData, sourceUrlToSave, blob);

    if (onComplete) onComplete();
    return true;
}

export const downloadAndSaveTrack = async (
    track: ItunesTrack | null,
    url: string | null,
    id: string,
    onProgress?: (progress: number) => void,
    onComplete?: () => void
) => {
    try {
        let downloadUrl = "";

        if (track) {
            if ((track as any)._source === 'deezer' && track.trackId) {
                downloadUrl = `/api/deezer?id=${track.trackId}`;
            } else {
                downloadUrl = `/api/deezer?title=${encodeURIComponent(track.trackName)}&artist=${encodeURIComponent(track.artistName)}`;
            }
        } else if (url) {
            downloadUrl = `/api/download?url=${encodeURIComponent(url)}`;
        } else {
            throw new Error("No track data nor url provided.");
        }

        // Timeout de 2 minutos
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 120000);

        // Simular progreso
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

        const response = await fetch(downloadUrl, { signal: controller.signal });
        clearTimeout(timeout);
        if (fakeProgressInterval) clearInterval(fakeProgressInterval);

        // Si Deezer falló (500), intentar fallback con YouTube
        if (!response.ok && downloadUrl.includes('/api/deezer') && track) {
            console.warn("[Download] Deezer API failed, falling back to YouTube...");
            if (onProgress) onProgress(30);

            const fallbackUrl = `/api/download?title=${encodeURIComponent(track.trackName)}&artist=${encodeURIComponent(track.artistName)}`;
            const fallbackRes = await fetch(fallbackUrl);

            if (!fallbackRes.ok) {
                throw new Error("Both Deezer and YouTube failed");
            }

            const contentType = fallbackRes.headers.get('content-type') || '';

            // Si la respuesta es JSON (Vercel devuelve URL directa)
            if (contentType.includes('application/json')) {
                const data = await fallbackRes.json();
                if (data.audioUrl) {
                    console.log("[Download] Got direct audio URL, downloading from CDN...");
                    return downloadFromDirectUrl(
                        data.audioUrl,
                        { title: data.title, artist: data.artist, coverUrl: data.coverUrl },
                        track, url, id, onProgress, onComplete
                    );
                }
                throw new Error("API returned JSON but no audioUrl");
            }

            // Si la respuesta es audio binario (local/yt-dlp)
            return processDownloadResponse(fallbackRes, track, url, id, onProgress, onComplete);
        }

        if (!response.ok) throw new Error("Failed to download file");

        return processDownloadResponse(response, track, url, id, onProgress, onComplete);
    } catch (error) {
        console.error("Error downloading and saving track", error);
        return false;
    }
};

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

        if (!res.ok) throw new Error("Fetch failed: " + res.status);

        if (!firstHeaders) firstHeaders = res.headers;

        const contentRange = res.headers.get("Content-Range");
        if (contentRange) {
            totalBytes = parseInt(contentRange.split("/")[1], 10);
        } else if (!totalBytes) {
            totalBytes = parseInt(res.headers.get("Content-Length") || "0", 10);
        }

        contentType = res.headers.get("Content-Type") || contentType;

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
        const headerTitle = headers.get("X-Video-Title");
        const headerArtist = headers.get("X-Video-Artist");
        const headerCover = headers.get("X-Video-Cover");
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

        try {
            const { blob, headers } = await fetchWithChunks(downloadUrl, controller, onProgress);
            clearTimeout(timeout);
            if (fakeProgressInterval) clearInterval(fakeProgressInterval);

            await processResolvedBlob(blob, headers, track, url, id);
            if (onComplete) onComplete();
            return true;
        } catch (downloadErr: any) {
            clearTimeout(timeout);
            if (fakeProgressInterval) clearInterval(fakeProgressInterval);

            // Si Deezer falló intentar fallback con YouTube solo si hay track
            if (downloadUrl.includes('/api/deezer') && track) {
                console.warn("[Download] Deezer API failed, falling back to YouTube...");
                if (onProgress) onProgress(30);

                const fallbackUrl = `/api/download?title=${encodeURIComponent(track.trackName)}&artist=${encodeURIComponent(track.artistName)}`;
                const { blob, headers } = await fetchWithChunks(fallbackUrl, controller, onProgress);

                await processResolvedBlob(blob, headers, track, url, id);
                if (onComplete) onComplete();
                return true;
            } else {
                throw downloadErr;
            }
        }
    } catch (error) {
        console.error("Error downloading and saving track", error);
        return false;
    }
};

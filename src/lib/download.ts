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

export const downloadAndSaveTrack = async (
    track: ItunesTrack | null,
    url: string | null, // direct url if exists
    id: string,
    onProgress?: (progress: number) => void,
    onComplete?: () => void
) => {
    try {
        let downloadUrl = "";

        // Si track (iTunes object) fue provisto, enviamos artist y title para buscar en YT.
        // Si no (descarga manual por link), enviamos directo la url.
        if (track) {
            downloadUrl = `/api/download?title=${encodeURIComponent(track.trackName)}&artist=${encodeURIComponent(track.artistName)}`;
        } else if (url) {
            downloadUrl = `/api/download?url=${encodeURIComponent(url)}`;
        } else {
            throw new Error("No track data nor url provided.");
        }

        // Timeout de 2 minutos para el request inicial
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 120000);

        // Simular progreso mientras el servidor descarga de YouTube internamente
        let fakeProgressInterval: NodeJS.Timeout | null = null;
        if (onProgress) {
            let fp = 0;
            fakeProgressInterval = setInterval(() => {
                // Subir poco a poco hasta 90%
                if (fp < 90) {
                    fp += Math.random() * 4 + 1; // incrementos aleatorios
                    if (fp > 90) fp = 90;
                    onProgress(Math.floor(fp));
                }
            }, 600);
        }

        const response = await fetch(downloadUrl, { signal: controller.signal });
        clearTimeout(timeout);
        if (fakeProgressInterval) clearInterval(fakeProgressInterval);

        if (!response.ok) throw new Error("Failed to download file");

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
                    // El último 10% es la descarga real del servidor al cliente
                    const realProgress = (loadedBytes / totalBytes) * 10;
                    onProgress(Math.min(100, Math.round(90 + realProgress)));
                } else if (onProgress) {
                    onProgress(95);
                }
            }
        }

        if (onProgress) onProgress(100);

        const blob = new Blob(chunks as unknown as BlobPart[], { type: response.headers.get("Content-Type") || "audio/mpeg" });

        // Extraer metadatos del header si el servidor los provee (yt-dlp)
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

        const sourceUrlToSave = url || (track ? `https://itunes.apple.com/search?term=${encodeURIComponent(track.trackName + " " + track.artistName)}` : "");

        await addSongToLibrary(trackData, sourceUrlToSave, blob);

        if (onComplete) onComplete();
        return true;
    } catch (error) {
        console.error("Error downloading and saving track", error);
        return false;
    }
};

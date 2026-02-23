import { saveTrackToDB, SavedTrack } from "./db";

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
}

export const downloadAndSaveTrack = async (
    track: ItunesTrack | null,
    url: string | null, // direct url if exists
    id: string,
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

        const response = await fetch(downloadUrl);
        if (!response.ok) throw new Error("Failed to download file");

        const blob = await response.blob();

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

        const savedTrack: SavedTrack = {
            id,
            title: resolvedTitle,
            artist: resolvedArtist,
            album: track?.collectionName || "",
            coverUrl: resolvedCover,
            blob,
            downloadedAt: Date.now(),
        };

        await saveTrackToDB(savedTrack);
        if (onComplete) onComplete();
        return true;
    } catch (error) {
        console.error("Error downloading and saving track", error);
        return false;
    }
};

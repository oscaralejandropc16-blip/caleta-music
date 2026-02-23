import localforage from "localforage";

// Configurar la instancia principal
localforage.config({
    name: "CaletaMusicDB",
    storeName: "tracks",
    description: "Almacenamiento offline de canciones y metadatos",
});

// Store para las pistas
const tracksStore = localforage.createInstance({
    name: "CaletaMusicDB",
    storeName: "tracks"
});

// Store para las playlists
const playlistsStore = localforage.createInstance({
    name: "CaletaMusicDB",
    storeName: "playlists"
});

// Store para los likes
const likesStore = localforage.createInstance({
    name: "CaletaMusicDB",
    storeName: "likes"
});

export interface SavedTrack {
    id: string;
    title: string;
    artist: string;
    album: string;
    coverUrl: string;
    blob: Blob;
    downloadedAt: number;
}

export interface Playlist {
    id: string;
    name: string;
    description?: string;
    coverUrl?: string;
    coverBlob?: Blob; // portada personalizada subida por el usuario
    trackIds: string[];
    createdAt: number;
}

// --- TRACKS ---

export async function saveTrackToDB(track: SavedTrack): Promise<void> {
    try {
        await tracksStore.setItem(track.id, track);
    } catch (err) {
        console.error("Error guardando pista:", err);
        throw err;
    }
}

export async function getTrackFromDB(id: string): Promise<SavedTrack | null> {
    try {
        return await tracksStore.getItem<SavedTrack>(id);
    } catch (err) {
        console.error("Error obteniendo pista:", err);
        return null;
    }
}

export async function getAllTracksFromDB(): Promise<SavedTrack[]> {
    const tracks: SavedTrack[] = [];
    try {
        await tracksStore.iterate((value: unknown) => {
            tracks.push(value as SavedTrack);
        });
        return tracks.sort((a, b) => b.downloadedAt - a.downloadedAt);
    } catch (err) {
        console.error("Error obteniendo pistas:", err);
        return [];
    }
}

export async function removeTrackFromDB(id: string): Promise<void> {
    try {
        await tracksStore.removeItem(id);
        // Remover la pista de todas las playlists
        const playlists = await getAllPlaylists();
        for (const pl of playlists) {
            if (pl.trackIds.includes(id)) {
                await updatePlaylist({
                    ...pl,
                    trackIds: pl.trackIds.filter(tid => tid !== id)
                });
            }
        }
        // Quitar like también
        await unlikeTrack(id);
    } catch (err) {
        console.error("Error eliminando pista:", err);
    }
}

// --- LIKES ---

export async function likeTrack(trackId: string): Promise<void> {
    await likesStore.setItem(trackId, Date.now());
}

export async function unlikeTrack(trackId: string): Promise<void> {
    await likesStore.removeItem(trackId);
}

export async function isTrackLiked(trackId: string): Promise<boolean> {
    const val = await likesStore.getItem(trackId);
    return val !== null;
}

export async function getAllLikedTrackIds(): Promise<string[]> {
    const ids: { id: string; ts: number }[] = [];
    await likesStore.iterate((value: unknown, key: string) => {
        ids.push({ id: key, ts: value as number });
    });
    return ids.sort((a, b) => b.ts - a.ts).map(i => i.id);
}

export async function toggleLike(trackId: string): Promise<boolean> {
    const liked = await isTrackLiked(trackId);
    if (liked) {
        await unlikeTrack(trackId);
        return false;
    } else {
        await likeTrack(trackId);
        return true;
    }
}

// --- PLAYLISTS ---

export async function createPlaylist(
    name: string,
    description?: string,
    coverBlob?: Blob
): Promise<Playlist> {
    const newPlaylist: Playlist = {
        id: `pl_${Date.now()}`,
        name,
        description: description || "",
        coverBlob: coverBlob || undefined,
        trackIds: [],
        createdAt: Date.now()
    };
    await playlistsStore.setItem(newPlaylist.id, newPlaylist);
    return newPlaylist;
}

export async function getAllPlaylists(): Promise<Playlist[]> {
    const playlists: Playlist[] = [];
    try {
        await playlistsStore.iterate((value: unknown) => {
            playlists.push(value as Playlist);
        });
        return playlists.sort((a, b) => b.createdAt - a.createdAt);
    } catch (err) {
        console.error("Error obteniendo playlists:", err);
        return [];
    }
}

export async function getPlaylist(id: string): Promise<Playlist | null> {
    try {
        return await playlistsStore.getItem<Playlist>(id);
    } catch {
        return null;
    }
}

export async function updatePlaylist(playlist: Playlist): Promise<void> {
    await playlistsStore.setItem(playlist.id, playlist);
}

export async function deletePlaylist(id: string): Promise<void> {
    await playlistsStore.removeItem(id);
}

export async function addTrackToPlaylist(playlistId: string, trackId: string): Promise<void> {
    const playlist = await playlistsStore.getItem<Playlist>(playlistId);
    if (playlist && !playlist.trackIds.includes(trackId)) {
        playlist.trackIds.push(trackId);
        await updatePlaylist(playlist);
    }
}

export async function removeTrackFromPlaylist(playlistId: string, trackId: string): Promise<void> {
    const playlist = await playlistsStore.getItem<Playlist>(playlistId);
    if (playlist) {
        playlist.trackIds = playlist.trackIds.filter(id => id !== trackId);
        await updatePlaylist(playlist);
    }
}

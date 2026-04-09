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
export const playlistsStore = localforage.createInstance({
    name: "CaletaMusicDB",
    storeName: "playlists"
});

// Store para los likes
const likesStore = localforage.createInstance({
    name: "CaletaMusicDB",
    storeName: "likes"
});

// Store para álbumes guardados
const albumsStore = localforage.createInstance({
    name: "CaletaMusicDB",
    storeName: "albums"
});


// Store para los BLOBs de audio (mejora masiva de rendimiento)
const audioBlobsStore = localforage.createInstance({
    name: "CaletaMusicDB",
    storeName: "audio_blobs"
});


export interface SavedTrack {
    id: string;
    title: string;
    artist: string;
    album: string;
    coverUrl: string;
    blob?: Blob; // Opcional para poder soportar streaming
    streamUrl?: string; // URL directa para hacer streaming (ej: API de descarga route.ts)
    previewUrl?: string; // URL de preview de Deezer (30s) como último fallback
    downloadedAt: number;
    localPath?: string; // Ruta de guardado en móvil
    isNativeDownload?: boolean; // Para identificar que fue descargado con Capacitor
    hasLocalBlob?: boolean; // Bandera para saber si el blob está en audioBlobsStore
}

export interface SavedAlbum {
    id: string; // collectionId from iTunes/Deezer
    name: string;
    artist: string;
    coverUrl: string;
    trackCount?: number;
    savedAt: number;
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
        const toSave = { ...track };
        if (toSave.blob) {
            await audioBlobsStore.setItem(toSave.id, toSave.blob);
            toSave.hasLocalBlob = true;
            delete toSave.blob; // Save ram!
        }
        await tracksStore.setItem(toSave.id, toSave);
    } catch (err) {
        console.error("Error guardando pista:", err);
        throw err;
    }
}

export async function getTrackFromDB(id: string): Promise<SavedTrack | null> {
    try {
        const track = await tracksStore.getItem<SavedTrack>(id);
        if (track) {
            // Restore legacy blob or load from new store
            if (track.blob) {
                return track;
            } else if (track.hasLocalBlob) {
                const blob = await audioBlobsStore.getItem<Blob>(id);
                if (blob) track.blob = blob;
            }
        }
        return track;
    } catch (err) {
        console.error("Error obteniendo pista:", err);
        return null;
    }
}

export async function getAllTracksFromDB(): Promise<SavedTrack[]> {
    const tracks: SavedTrack[] = [];
    const migrations: { key: string, track: SavedTrack }[] = [];

    try {
        await tracksStore.iterate((value: unknown, key: string) => {
            const track = value as SavedTrack;
            if (track.blob) {
                migrations.push({ key, track });
            } else {
                tracks.push(track);
            }
        });

        // Run migrations sequentially to prevent out-of-memory crashes on iOS
        for (const { key, track } of migrations) {
            try {
                const blob = track.blob;
                const migratedTrack = { ...track };
                delete migratedTrack.blob;
                migratedTrack.hasLocalBlob = true;

                tracks.push(migratedTrack);

                await audioBlobsStore.setItem(key, blob);
                await tracksStore.setItem(key, migratedTrack);
            } catch (e) {
                console.warn("Error migrating track blob", e);
            }
        }

        return tracks.sort((a, b) => (b.downloadedAt || 0) - (a.downloadedAt || 0));
    } catch (err) {
        console.error("Error obteniendo pistas:", err);
        return [];
    }
}

export async function removeTrackFromDB(id: string): Promise<void> {
    try {
        await tracksStore.removeItem(id);
        await audioBlobsStore.removeItem(id); // Delete blob too

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

export async function toggleLike(track: SavedTrack): Promise<boolean> {
    const liked = await isTrackLiked(track.id);
    if (liked) {
        await unlikeTrack(track.id);

        // Cleanup if not downloaded and not in playlists
        const isDownloaded = (await getTrackFromDB(track.id))?.blob !== undefined;
        let inAnyPlaylist = false;
        await playlistsStore.iterate((pl: unknown) => {
            if ((pl as Playlist).trackIds.includes(track.id)) inAnyPlaylist = true;
        });
        if (!isDownloaded && !inAnyPlaylist) {
            await tracksStore.removeItem(track.id);
        }

        return false;
    } else {
        await likeTrack(track.id);
        // Save metadata without blob so we have it for 'Favoritas' offline
        const existing = await getTrackFromDB(track.id);
        if (!existing) {
            await tracksStore.setItem(track.id, {
                id: track.id,
                title: track.title,
                artist: track.artist,
                album: track.album || '',
                coverUrl: track.coverUrl,
                streamUrl: track.streamUrl || track.previewUrl,
                downloadedAt: Date.now()
            });
        }
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
        trackIds: [],
        createdAt: Date.now()
    };
    if (coverBlob) {
        newPlaylist.coverBlob = coverBlob;
    }

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

export async function clearAllLocalData(): Promise<void> {
    try {
        await tracksStore.clear();
        await audioBlobsStore.clear();
        await likesStore.clear();
        await playlistsStore.clear();
        await albumsStore.clear();
    } catch (e) {
        console.error("Failed to clear local DBs:", e);
    }
}

// --- ALBUMS ---

export async function saveAlbum(album: SavedAlbum): Promise<void> {
    await albumsStore.setItem(album.id, album);
}

export async function removeAlbum(id: string): Promise<void> {
    await albumsStore.removeItem(id);
}

export async function isAlbumSaved(id: string): Promise<boolean> {
    if (!id) return false;
    const val = await albumsStore.getItem(id);
    return val !== null;
}

export async function getAllSavedAlbums(): Promise<SavedAlbum[]> {
    const albums: SavedAlbum[] = [];
    try {
        await albumsStore.iterate((value: unknown) => {
            albums.push(value as SavedAlbum);
        });
        return albums.sort((a, b) => b.savedAt - a.savedAt);
    } catch (err) {
        console.error("Error obteniendo álbumes:", err);
        return [];
    }
}


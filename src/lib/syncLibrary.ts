import { supabase } from '@/lib/supabase';
import { saveTrackToDB, SavedTrack } from '@/lib/db';

/**
 * Agrega una canción a la nube (Supabase) y al almacenamiento local.
 */
export async function addSongToLibrary(
    trackData: Omit<SavedTrack, "blob" | "downloadedAt">,
    sourceUrl: string,
    blob?: Blob
) {
    // 1. Sync to cloud in background
    (async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const userId = session?.user?.id;
            if (!userId) return;

            const { error } = await supabase.from('user_library').upsert({
                user_id: userId,
                track_id: trackData.id,
                title: trackData.title,
                artist: trackData.artist,
                album: trackData.album || '',
                cover_url: trackData.coverUrl || '',
                stream_url: trackData.streamUrl || sourceUrl || '',
                preview_url: trackData.previewUrl || '',
                liked: false,
                downloaded_at: Date.now(),
            }, { onConflict: 'user_id,track_id' });

            if (error) console.warn('[Sync] Cloud save error:', error.message);
        } catch {
            // Ignore background errors
        }
    })();

    // 2. Save blob to IndexedDB locally
    if (blob) {
        await saveTrackToDB({
            ...trackData,
            blob,
            downloadedAt: Date.now()
        });
    }
}

export async function getUserLibrary(): Promise<SavedTrack[]> {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) return [];

        const { data, error } = await supabase
            .from('user_library')
            .select('*')
            .eq('user_id', session.user.id)
            .order('downloaded_at', { ascending: false });

        if (error) {
            console.warn('[Sync] Fetch library error:', error.message);
            return [];
        }

        return (data || []).map((row: any) => ({
            id: row.track_id,
            title: row.title,
            artist: row.artist,
            album: row.album || '',
            coverUrl: row.cover_url || '',
            streamUrl: row.stream_url || '',
            previewUrl: row.preview_url || '',
            downloadedAt: row.downloaded_at,
        }));
    } catch {
        return [];
    }
}

export async function removeSongFromLibrary(songId: string) {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) return;

        await supabase
            .from('user_library')
            .delete()
            .match({ user_id: session.user.id, track_id: songId });
    } catch {
        // Ignore
    }
}

export async function clearEntireLibrary() {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) return;

        await supabase
            .from('user_library')
            .delete()
            .eq('user_id', session.user.id);
    } catch {
        // Ignore
    }
}

// ===== PLAYLIST SYNC =====

import { Playlist, getAllPlaylists, getPlaylist } from '@/lib/db';
import { playlistsStore } from '@/lib/db';

/**
 * Sube una playlist a la nube (Supabase).
 */
export async function syncPlaylistToCloud(playlist: Playlist): Promise<void> {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) return;

        const { error } = await supabase.from('user_playlists').upsert({
            user_id: session.user.id,
            playlist_id: playlist.id,
            name: playlist.name,
            description: playlist.description || '',
            cover_url: playlist.coverUrl || '',
            track_ids: playlist.trackIds,
            created_at: playlist.createdAt,
            updated_at: Date.now(),
        }, { onConflict: 'user_id,playlist_id' });

        if (error) console.warn('[Sync] Playlist sync error:', error.message);
    } catch (err) {
        console.error('[Sync] Playlist sync error:', err);
    }
}

/**
 * Sube TODAS las playlists locales a la nube.
 */
export async function pushAllPlaylistsToCloud(): Promise<void> {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) return;

        const playlists = await getAllPlaylists();
        for (const pl of playlists) {
            await syncPlaylistToCloud(pl);
        }
        console.log(`[Sync] Pushed ${playlists.length} playlists to cloud`);
    } catch (err) {
        console.error('[Sync] Push playlists error:', err);
    }
}

/**
 * Trae las playlists de la nube y las guarda localmente (sin sobreescribir las locales).
 */
export async function pullPlaylistsFromCloud(): Promise<Playlist[]> {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) return [];

        const { data, error } = await supabase
            .from('user_playlists')
            .select('*')
            .eq('user_id', session.user.id)
            .order('created_at', { ascending: false });

        if (error) {
            console.warn('[Sync] Pull playlists error:', error.message);
            return [];
        }

        if (!data || data.length === 0) return [];

        const cloudPlaylists: Playlist[] = [];
        const localPlaylists = await getAllPlaylists();
        const localIds = new Set(localPlaylists.map(p => p.id));

        for (const row of data) {
            const playlist: Playlist = {
                id: row.playlist_id,
                name: row.name,
                description: row.description || '',
                coverUrl: row.cover_url || '',
                trackIds: row.track_ids || [],
                createdAt: row.created_at,
            };

            // Solo guardar localmente si no existe ya
            if (!localIds.has(playlist.id)) {
                await playlistsStore.setItem(playlist.id, playlist);
            }

            cloudPlaylists.push(playlist);
        }

        console.log(`[Sync] Pulled ${cloudPlaylists.length} playlists from cloud`);
        return cloudPlaylists;
    } catch (err) {
        console.error('[Sync] Pull playlists error:', err);
        return [];
    }
}

/**
 * Elimina una playlist de la nube.
 */
export async function removePlaylistFromCloud(playlistId: string): Promise<void> {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) return;

        await supabase
            .from('user_playlists')
            .delete()
            .match({ user_id: session.user.id, playlist_id: playlistId });
    } catch {
        // Ignore
    }
}

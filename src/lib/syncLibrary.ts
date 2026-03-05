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

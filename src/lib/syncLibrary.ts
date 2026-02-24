import { supabase } from '@/lib/supabase';
import { saveTrackToDB, SavedTrack } from '@/lib/db';

export interface CloudTrack {
    song_id: string;
    title: string;
    artist: string;
    cover_url: string;
    source_audio_url: string;
    added_at: string;
}

/**
 * Agrega una canción a la nube (Supabase) y opcionalmente descarga el blob al almacenamiento local.
 */
export async function addSongToLibrary(
    trackData: Omit<SavedTrack, "blob" | "downloadedAt">,
    sourceUrl: string,
    blob?: Blob
) {
    // 1. Revisar si hay usuario autenticado (skip si Supabase no está configurado)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (supabaseUrl) {
        // Ejecutar en background para no bloquear la UI si la base de datos de Supabase está en pausa (free tier) o la red está lenta.
        (async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                const userId = session?.user?.id;

                if (userId) {
                    const { error } = await supabase.from('user_library').upsert({
                        user_id: userId,
                        song_id: trackData.id,
                        title: trackData.title,
                        artist: trackData.artist,
                        cover_url: trackData.coverUrl || '',
                        source_audio_url: sourceUrl || ''
                    }, { onConflict: 'user_id,song_id' });

                    if (error) {
                        console.warn('Error syncing track to cloud (non-critical):', error.message);
                    }
                }
            } catch {
                // Ignore background errors
            }
        })();
    }

    // 3. Guardar el archivo pesado en IndexedDB (localforage)
    if (blob) {
        await saveTrackToDB({
            ...trackData,
            blob,
            downloadedAt: Date.now()
        });
    }
}

export async function getUserLibrary(): Promise<CloudTrack[]> {
    try {
        if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return [];
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) return [];

        const { data, error } = await supabase
            .from('user_library')
            .select('*')
            .order('added_at', { ascending: false });

        if (error) {
            console.warn('Error fetching user library (non-critical):', error.message);
            return [];
        }
        return data || [];
    } catch {
        return [];
    }
}

export async function removeSongFromLibrary(songId: string) {
    try {
        if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) return;

        await supabase
            .from('user_library')
            .delete()
            .match({ user_id: session.user.id, song_id: songId });
    } catch {
        // Supabase not available
    }
}

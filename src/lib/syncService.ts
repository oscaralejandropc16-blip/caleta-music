import { supabase } from "./supabase";
import { SavedTrack, getAllTracksFromDB, saveTrackToDB, getAllLikedTrackIds, likeTrack, unlikeTrack } from "./db";

// ===== SYNC: Push local library to Supabase =====

export async function pushLibraryToCloud(userId: string): Promise<void> {
    try {
        const localTracks = await getAllTracksFromDB();
        const likedIds = new Set(await getAllLikedTrackIds());

        if (localTracks.length === 0) return;

        const rows = localTracks.map(t => ({
            user_id: userId,
            track_id: t.id,
            title: t.title,
            artist: t.artist,
            album: t.album || "",
            cover_url: t.coverUrl || "",
            stream_url: t.streamUrl || "",
            preview_url: t.previewUrl || "",
            liked: likedIds.has(t.id),
            downloaded_at: t.downloadedAt,
        }));

        // Upsert in small batches (avoid payload too large)
        const BATCH = 50;
        for (let i = 0; i < rows.length; i += BATCH) {
            const batch = rows.slice(i, i + BATCH);
            const { error } = await supabase
                .from("user_library")
                .upsert(batch, { onConflict: "user_id,track_id" });
            if (error) console.error("[Sync] Push batch error:", error.message);
        }

        console.log(`[Sync] Pushed ${rows.length} tracks to cloud`);
    } catch (err) {
        console.error("[Sync] Push error:", err);
    }
}

// ===== SYNC: Pull cloud library to local =====

export async function pullLibraryFromCloud(userId: string): Promise<SavedTrack[]> {
    try {
        const { data, error } = await supabase
            .from("user_library")
            .select("*")
            .eq("user_id", userId)
            .order("downloaded_at", { ascending: false });

        if (error) {
            console.error("[Sync] Pull error:", error.message);
            return [];
        }

        if (!data || data.length === 0) return [];

        const cloudTracks: SavedTrack[] = [];

        for (const row of data) {
            const track: SavedTrack = {
                id: row.track_id,
                title: row.title,
                artist: row.artist,
                album: row.album || "",
                coverUrl: row.cover_url || "",
                streamUrl: row.stream_url || "",
                previewUrl: row.preview_url || "",
                downloadedAt: row.downloaded_at,
            };

            // Save to local DB if it doesn't exist locally
            await saveTrackToDB(track);

            // Sync likes
            if (row.liked) {
                await likeTrack(track.id);
            }

            cloudTracks.push(track);
        }

        console.log(`[Sync] Pulled ${cloudTracks.length} tracks from cloud`);
        return cloudTracks;
    } catch (err) {
        console.error("[Sync] Pull error:", err);
        return [];
    }
}

// ===== SYNC: Save single track to cloud =====

export async function syncTrackToCloud(userId: string, track: SavedTrack, liked: boolean = false): Promise<void> {
    try {
        const { error } = await supabase
            .from("user_library")
            .upsert({
                user_id: userId,
                track_id: track.id,
                title: track.title,
                artist: track.artist,
                album: track.album || "",
                cover_url: track.coverUrl || "",
                stream_url: track.streamUrl || "",
                preview_url: track.previewUrl || "",
                liked,
                downloaded_at: track.downloadedAt,
            }, { onConflict: "user_id,track_id" });

        if (error) console.error("[Sync] Track sync error:", error.message);
    } catch (err) {
        console.error("[Sync] Track sync error:", err);
    }
}

// ===== SYNC: Update like status in cloud =====

export async function syncLikeToCloud(userId: string, trackId: string, liked: boolean): Promise<void> {
    try {
        const { error } = await supabase
            .from("user_library")
            .update({ liked })
            .eq("user_id", userId)
            .eq("track_id", trackId);

        if (error) console.error("[Sync] Like sync error:", error.message);
    } catch (err) {
        console.error("[Sync] Like sync error:", err);
    }
}

// ===== SYNC: Remove track from cloud =====

export async function removeTrackFromCloud(userId: string, trackId: string): Promise<void> {
    try {
        const { error } = await supabase
            .from("user_library")
            .delete()
            .eq("user_id", userId)
            .eq("track_id", trackId);

        if (error) console.error("[Sync] Remove error:", error.message);
    } catch (err) {
        console.error("[Sync] Remove error:", err);
    }
}

// ===== Full bidirectional sync =====

export async function fullSync(userId: string): Promise<void> {
    console.log("[Sync] Starting full bidirectional sync...");
    // 1. Pull from cloud first (so we get tracks from other devices)
    await pullLibraryFromCloud(userId);
    // 2. Push local to cloud (so new local tracks get uploaded)
    await pushLibraryToCloud(userId);
    console.log("[Sync] Full sync complete ✓");
}

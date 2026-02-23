-- =============================================
-- CALETA MUSIC - Database Setup
-- Run this in Supabase SQL Editor
-- =============================================

-- 1. Profiles table (linked to auth.users)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT NOT NULL DEFAULT '',
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. User playlists
CREATE TABLE IF NOT EXISTS user_playlists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    cover_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Playlist tracks (songs in a playlist)
CREATE TABLE IF NOT EXISTS playlist_tracks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    playlist_id UUID REFERENCES user_playlists(id) ON DELETE CASCADE NOT NULL,
    track_id TEXT NOT NULL,
    track_name TEXT NOT NULL,
    artist_name TEXT NOT NULL,
    album_name TEXT DEFAULT '',
    artwork_url TEXT DEFAULT '',
    preview_url TEXT DEFAULT '',
    added_at TIMESTAMPTZ DEFAULT NOW(),
    position INTEGER DEFAULT 0
);

-- 4. User liked songs 
CREATE TABLE IF NOT EXISTS user_likes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    track_id TEXT NOT NULL,
    track_name TEXT NOT NULL,
    artist_name TEXT NOT NULL,
    album_name TEXT DEFAULT '',
    artwork_url TEXT DEFAULT '',
    liked_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, track_id)
);

-- 5. User listening history
CREATE TABLE IF NOT EXISTS listening_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    track_id TEXT NOT NULL,
    track_name TEXT NOT NULL,
    artist_name TEXT NOT NULL,
    artwork_url TEXT DEFAULT '',
    played_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- Row Level Security (RLS) - Users can only 
-- see/modify their own data
-- =============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE playlist_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE listening_history ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read their own, insert their own
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Playlists: users manage their own
CREATE POLICY "Users can view own playlists" ON user_playlists FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own playlists" ON user_playlists FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own playlists" ON user_playlists FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own playlists" ON user_playlists FOR DELETE USING (auth.uid() = user_id);

-- Playlist tracks: based on playlist ownership
CREATE POLICY "Users can view own playlist tracks" ON playlist_tracks FOR SELECT 
    USING (EXISTS (SELECT 1 FROM user_playlists WHERE id = playlist_tracks.playlist_id AND user_id = auth.uid()));
CREATE POLICY "Users can insert own playlist tracks" ON playlist_tracks FOR INSERT 
    WITH CHECK (EXISTS (SELECT 1 FROM user_playlists WHERE id = playlist_tracks.playlist_id AND user_id = auth.uid()));
CREATE POLICY "Users can delete own playlist tracks" ON playlist_tracks FOR DELETE 
    USING (EXISTS (SELECT 1 FROM user_playlists WHERE id = playlist_tracks.playlist_id AND user_id = auth.uid()));

-- Likes: users manage their own
CREATE POLICY "Users can view own likes" ON user_likes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own likes" ON user_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own likes" ON user_likes FOR DELETE USING (auth.uid() = user_id);

-- History: users manage their own
CREATE POLICY "Users can view own history" ON listening_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own history" ON listening_history FOR INSERT WITH CHECK (auth.uid() = user_id);

-- =============================================
-- Indexes for performance
-- =============================================
CREATE INDEX IF NOT EXISTS idx_playlists_user ON user_playlists(user_id);
CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist ON playlist_tracks(playlist_id);
CREATE INDEX IF NOT EXISTS idx_likes_user ON user_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_history_user ON listening_history(user_id);
CREATE INDEX IF NOT EXISTS idx_history_played ON listening_history(played_at DESC);

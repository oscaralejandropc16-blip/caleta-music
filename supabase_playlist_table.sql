-- Tabla para sincronizar playlists entre dispositivos
CREATE TABLE IF NOT EXISTS user_playlists (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    playlist_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    cover_url TEXT DEFAULT '',
    track_ids JSONB DEFAULT '[]'::jsonb,
    created_at BIGINT NOT NULL,
    updated_at BIGINT DEFAULT 0,
    UNIQUE(user_id, playlist_id)
);

-- Habilitar RLS (Row Level Security)
ALTER TABLE user_playlists ENABLE ROW LEVEL SECURITY;

-- Políticas: cada usuario solo puede ver/modificar sus propias playlists
CREATE POLICY "Users can view own playlists"
    ON user_playlists FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own playlists"
    ON user_playlists FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own playlists"
    ON user_playlists FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own playlists"
    ON user_playlists FOR DELETE
    USING (auth.uid() = user_id);

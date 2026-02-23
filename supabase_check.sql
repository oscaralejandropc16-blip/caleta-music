-- Quick check: verify all tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('profiles', 'user_playlists', 'playlist_tracks', 'user_likes', 'listening_history')
ORDER BY table_name;

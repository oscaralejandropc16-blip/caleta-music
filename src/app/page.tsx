"use client";

import { useEffect, useState, useRef } from "react";
import {
  Play, Download, Check, Heart, Disc3,
  ChevronLeft, ChevronRight, TrendingUp,
  Headphones, Music2, Sparkles, ListMusic
} from "lucide-react";
import { getAllTracksFromDB, toggleLike, getAllLikedTrackIds, getAllPlaylists, Playlist, getAllSavedAlbums, SavedAlbum } from "@/lib/db";
import { downloadAndSaveTrack, ItunesTrack } from "@/lib/download";
import { usePlayer } from "@/context/PlayerContext";
import Logo from "@/components/Logo";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import OnboardingModal from "@/components/OnboardingModal";

const GENRES = [
  { name: "Pop", color: "from-pink-500 to-rose-600", term: "pop", artists: ["Taylor Swift", "Ariana Grande", "Dua Lipa", "Justin Bieber", "Bruno Mars", "The Weeknd"] },
  { name: "Reggaeton", color: "from-amber-500 to-orange-600", term: "reggaeton", artists: ["Bad Bunny", "Daddy Yankee", "J Balvin", "Karol G", "Maluma", "Rauw Alejandro"] },
  { name: "Rock", color: "from-red-600 to-rose-900", term: "rock", artists: ["Queen", "AC/DC", "Nirvana", "The Beatles", "Guns N' Roses", "Pink Floyd"] },
  { name: "Hip Hop", color: "from-violet-600 to-indigo-900", term: "hip hop", artists: ["Drake", "Eminem", "Kendrick Lamar", "Kanye West", "Travis Scott", "J. Cole"] },
  { name: "Electrónica", color: "from-cyan-500 to-blue-700", term: "electronic", artists: ["David Guetta", "Calvin Harris", "Avicii", "Martin Garrix", "Daft Punk", "Tiësto"] },
  { name: "R&B", color: "from-fuchsia-500 to-purple-800", term: "r&b", artists: ["Beyoncé", "SZA", "Usher", "Frank Ocean", "Chris Brown", "Alicia Keys"] },
  { name: "Latin", color: "from-emerald-500 to-teal-700", term: "latin", artists: ["Shakira", "Enrique Iglesias", "Romeo Santos", "Luis Fonsi", "Marc Anthony"] },
  { name: "Indie", color: "from-sky-500 to-indigo-700", term: "indie", artists: ["Arctic Monkeys", "The Strokes", "Tame Impala", "Florence + The Machine", "Bon Iver"] },
  { name: "Jazz", color: "from-yellow-600 to-amber-900", term: "jazz", artists: ["Miles Davis", "Frank Sinatra", "Louis Armstrong", "Nina Simone", "John Coltrane"] },
  { name: "Clásica", color: "from-slate-400 to-slate-700", term: "classical", artists: ["Mozart", "Beethoven", "Bach", "Chopin", "Vivaldi"] },
  { name: "Salsa", color: "from-orange-500 to-red-700", term: "salsa", artists: ["Celia Cruz", "Marc Anthony", "Rubén Blades", "Willie Colón", "Gilberto Santa Rosa", "Hector Lavoe"] },
  { name: "K-Pop", color: "from-pink-400 to-violet-600", term: "kpop", artists: ["BTS", "BLACKPINK", "TWICE", "Stray Kids", "EXO"] },
];

const TRENDING_TERMS = ["Bad Bunny", "Taylor Swift", "Peso Pluma", "Shakira", "Drake", "Karol G", "The Weeknd", "Dua Lipa"];

interface AlbumGroup { name: string; artist: string; cover: string; trackCount: number; }

interface TrackCardProps {
  track: ItunesTrack;
  size?: "normal" | "large";
  savedTrackIds: Set<string>;
  downloadingId: string | null;
  downloadProgress?: number;
  likedIds: Set<string>;
  onPlay: (e: React.MouseEvent, track: ItunesTrack) => void;
  onDownload: (track: ItunesTrack) => void;
  onToggleLike: (e: React.MouseEvent, trackId: string) => void;
  onAlbumClick: (album: string, artist: string, cover: string) => void;
  onArtistClick: (artist: string) => void;
}

function TrackCard({
  track,
  size = "normal",
  savedTrackIds,
  downloadingId,
  downloadProgress = 0,
  likedIds,
  onPlay,
  onDownload,
  onToggleLike,
  onAlbumClick,
  onArtistClick
}: TrackCardProps) {
  const strId = track.trackId.toString();
  const isDownloaded = savedTrackIds.has(strId);
  const isDownloading = downloadingId === strId;
  const isLiked = likedIds.has(strId);
  const w = size === "large" ? "min-w-[160px] md:min-w-[210px] w-[160px] md:w-[210px]" : "";

  return (
    <div className={`${w} flex-shrink-0 p-3.5 md:p-4 rounded-[20px] md:rounded-[24px] bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.02] hover:border-white/[0.08] transition-all duration-500 ease-out group hover:-translate-y-1.5 hover:shadow-[0_15px_40px_rgba(0,0,0,0.4)] flex flex-col`}>
      <div className="relative w-full aspect-square rounded-[14px] md:rounded-[16px] overflow-hidden shadow-2xl mb-4 bg-[#0a0f1e] border border-white/[0.05]">
        <img src={track.artworkUrl100.replace("100x100", "400x400")} alt={track.trackName}
          className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-110" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 md:via-black/20 to-transparent opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-between p-2 md:p-3 pb-2 md:pb-3 rounded-xl pointer-events-none">
          <div className="flex gap-1.5 md:gap-2 relative z-10 w-full justify-between items-center pointer-events-auto">
            <button onClick={(e) => onPlay(e, track)} title="Reproducir audio" aria-label={`Reproducir ${track.trackName}`}
              className="bg-green-500 text-white p-2.5 md:p-3 rounded-full hover:bg-green-400 transition-colors shadow-lg active:scale-95 focus-visible:ring-4 focus-visible:ring-green-400/50 outline-none">
              <Play size={18} className="ml-0.5 fill-current" />
            </button>
            <div className="flex gap-2">
              {!isDownloaded ? (
                <button onClick={() => onDownload(track)} disabled={isDownloading} title="Descargar audio offline" aria-label={`Descargar ${track.trackName}`}
                  className="bg-brand-500 text-white p-2.5 md:p-3 rounded-full hover:bg-brand-400 transition-colors shadow-lg shadow-brand-500/30 disabled:opacity-50 active:scale-95 focus-visible:ring-4 focus-visible:ring-brand-400/50 outline-none">
                  {isDownloading ? (
                    <div className="relative w-5 h-5 flex items-center justify-center">
                      <svg className="w-[30px] h-[30px] -rotate-90 transform absolute" viewBox="0 0 36 36" style={{ top: -5, left: -5 }}>
                        <path className="text-white/20 stroke-current" strokeWidth="3" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                        <path className="text-white stroke-current transition-all duration-300" strokeWidth="3" strokeDasharray={`${downloadProgress}, 100`} fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                      </svg>
                      <span className="text-[7px] font-bold text-white leading-none">{downloadProgress > 0 ? `${downloadProgress}` : <div className="h-3 w-3 border-[1.5px] border-white border-t-transparent rounded-full animate-spin" />}</span>
                    </div>
                  ) : <Download size={18} />}
                </button>
              ) : (
                <div className="bg-accent text-white p-2.5 md:p-3 rounded-full shadow-lg"><Check size={18} /></div>
              )}

              {isDownloaded && (
                <button onClick={(e) => onToggleLike(e, strId)} aria-label={isLiked ? `Quitar me gusta a ${track.trackName}` : `Dar me gusta a ${track.trackName}`}
                  className={`p-2.5 md:p-3 rounded-full transition-colors focus-visible:ring-4 focus-visible:ring-pink-500/50 outline-none active:scale-95 ${isLiked ? "text-pink-500 bg-pink-500/20" : "text-white/80 hover:text-pink-400 bg-black/40 md:bg-white/20 hover:bg-white/30 backdrop-blur-md"}`}>
                  <Heart size={16} fill={isLiked ? "currentColor" : "none"} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      <h3 className="text-white font-bold text-[14px] leading-tight truncate drop-shadow-sm mb-0.5" title={track.trackName}>{track.trackName}</h3>
      <button
        onClick={() => onArtistClick(track.artistName)}
        className="text-slate-400 text-[12px] font-medium truncate text-left hover:text-brand-400 hover:underline transition-colors outline-none"
        title={track.artistName}
      >
        {track.artistName}
      </button>
      {track.collectionName && (
        <button onClick={() => onAlbumClick(track.collectionName || "", track.artistName, track.artworkUrl100)}
          className="text-slate-500 text-[11px] truncate mt-1 hover:text-brand-400 transition-colors text-left flex items-center gap-1 group/album">
          <Disc3 size={10} className="group-hover/album:animate-spin" /><span className="truncate">{track.collectionName}</span>
        </button>
      )}
    </div>
  );
}

function HorizontalScroller({ children, title, icon }: { children: React.ReactNode; title: string; icon: React.ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const updateScroll = () => {
    if (scrollRef.current) {
      const el = scrollRef.current;
      setCanScrollLeft(el.scrollLeft > 10);
      setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10);
    }
  };

  const scroll = (dir: "left" | "right") => {
    scrollRef.current?.scrollBy({ left: dir === "left" ? -350 : 350, behavior: "smooth" });
  };

  return (
    <section className="mb-14 animate-fade-in-up">
      <div className="flex items-center justify-between mb-6 px-1 md:px-0">
        <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight flex items-center gap-2 md:gap-3 drop-shadow-lg">
          {icon}{title}
        </h2>
        <div className="flex gap-2">
          <button onClick={() => scroll("left")} disabled={!canScrollLeft}
            className={`p-2.5 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-all ${!canScrollLeft ? "opacity-20" : ""}`}>
            <ChevronLeft size={16} />
          </button>
          <button onClick={() => scroll("right")} disabled={!canScrollRight}
            className={`p-2.5 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-all ${!canScrollRight ? "opacity-20" : ""}`}>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      <div ref={scrollRef} onScroll={updateScroll} className="flex gap-4 overflow-x-auto scrollbar-hide pb-2">
        {children}
      </div>
    </section>
  );
}

export default function Home() {
  const [recommendations, setRecommendations] = useState<ItunesTrack[]>([]);
  const [trending, setTrending] = useState<ItunesTrack[]>([]);
  const [newReleases, setNewReleases] = useState<ItunesTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [savedTrackIds, setSavedTrackIds] = useState<Set<string>>(new Set());
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadProgresses, setDownloadProgresses] = useState<Record<string, number>>({});
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [genreTracks, setGenreTracks] = useState<ItunesTrack[]>([]);
  const [genreLoading, setGenreLoading] = useState(false);
  const [albums, setAlbums] = useState<AlbumGroup[]>([]);
  const [savedAlbums, setSavedAlbums] = useState<SavedAlbum[]>([]);
  const [activeCategory, setActiveCategory] = useState<"all" | "music">("all");


  const { playTrack } = usePlayer();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [favoriteArtists, setFavoriteArtists] = useState<string[] | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setFavoriteArtists([]);
    } else {
      try {
        const metadataArtists = user.user_metadata?.favorite_artists;
        if (metadataArtists && Array.isArray(metadataArtists) && metadataArtists.length > 0) {
          setFavoriteArtists(metadataArtists);
          try {
            localStorage.setItem(`caleta_artists_${user.id}`, JSON.stringify(metadataArtists));
          } catch { /* localStorage not available */ }
        } else {
          let saved: string | null = null;
          try {
            saved = localStorage.getItem(`caleta_artists_${user.id}`);
          } catch { /* localStorage not available */ }
          if (saved) {
            try {
              const parsed = JSON.parse(saved);
              setFavoriteArtists(parsed);

              // Si estaba en el local storage pero no en la nube, guárdalo 
              if (Array.isArray(parsed) && parsed.length > 0) {
                import('@/lib/supabase').then(({ supabase }) => {
                  supabase.auth.updateUser({ data: { favorite_artists: parsed } });
                }).catch(() => { });
              }
            } catch (e) {
              setFavoriteArtists([]);
            }
          } else {
            setFavoriteArtists(null); // Null will trigger the Onboarding modal!
          }
        }
      } catch (e) {
        console.warn("Error loading favorite artists:", e);
        setFavoriteArtists([]);
      }
    }
  }, [user, authLoading]);

  useEffect(() => {
    Promise.all([
      getAllTracksFromDB(),
      getAllLikedTrackIds(),
      getAllPlaylists(),
      getAllSavedAlbums()
    ]).then(([tracks, likedIdsList, playlistsData, savedAlbumsData]) => {
      setSavedTrackIds(new Set(tracks.map((t) => t.id)));
      setSavedAlbums(savedAlbumsData);

      const albumMap = new Map<string, AlbumGroup>();
      tracks.forEach(t => {
        if (t.album) {
          const key = `${t.album}||${t.artist}`;
          if (!albumMap.has(key)) albumMap.set(key, { name: t.album, artist: t.artist, cover: t.coverUrl, trackCount: 1 });
          else albumMap.get(key)!.trackCount++;
        }
      });
      setAlbums(Array.from(albumMap.values()).sort((a, b) => b.trackCount - a.trackCount));

      setLikedIds(new Set(likedIdsList));

      const playlistsWithCovers = playlistsData.map(pl => {
        if (!pl.coverUrl && !pl.coverBlob && pl.trackIds.length > 0) {
          const firstTrack = tracks.find(t => t.id === pl.trackIds[0]);
          if (firstTrack && firstTrack.coverUrl) {
            return { ...pl, coverUrl: firstTrack.coverUrl };
          }
        }
        return pl;
      });
      setPlaylists(playlistsWithCovers);

      // Stop blocking the UI since main app data is loaded
      setLoading(false);
    });

    const fetchData = async () => {
      try {
        if (!favoriteArtists) return; // Wait until favorite artists are loaded from onboarding

        const POPULAR_LATIN_HITS = ["Bad Bunny", "Feid", "Karol G", "Peso Pluma", "Rauw Alejandro", "Myke Towers", "Mora", "Eladio Carrion", "Young Miko", "Bizarrap", "Quevedo", "Rosalía"];

        let recTerm = POPULAR_LATIN_HITS[Math.floor(Math.random() * POPULAR_LATIN_HITS.length)];

        // If user selected favorite artists on onboarding, 50% chance to show one of them
        if (favoriteArtists.length > 0 && Math.random() > 0.5) {
          recTerm = favoriteArtists[Math.floor(Math.random() * favoriteArtists.length)];
        }

        const [recRes] = await Promise.all([
          fetch(`/api/search?term=${encodeURIComponent(recTerm)}`)
        ]);

        const [recData] = await Promise.all([
          recRes.json()
        ]);

        // Shuffle the results to make it feel fresh every time
        const shuffled = (recData.results || []).sort(() => 0.5 - Math.random());
        setRecommendations(shuffled.slice(0, 15));
      } catch (error) { console.error("Error fetching data", error); }
    };

    if (favoriteArtists) {
      fetchData();
    }
  }, [favoriteArtists]);

  const handleDownload = async (track: ItunesTrack) => {
    const strId = track.trackId.toString();
    setDownloadingId(strId);
    const result = await downloadAndSaveTrack(track, null, strId, (progress) => {
      setDownloadProgresses(prev => ({ ...prev, [strId]: progress }));
    });
    if (result.success) setSavedTrackIds((prev) => new Set(prev).add(strId));
    setDownloadingId(null);
  };

  const handleToggleLike = async (e: React.MouseEvent, trackId: string) => {
    e.stopPropagation();
    if (!savedTrackIds.has(trackId)) return;
    const nowLiked = await toggleLike(trackId);
    setLikedIds(prev => { const next = new Set(prev); if (nowLiked) next.add(trackId); else next.delete(trackId); return next; });
  };

  const handlePlay = (e: React.MouseEvent, track: ItunesTrack, contextTracks?: ItunesTrack[]) => {
    e.stopPropagation();

    const downloadUrl = (t: ItunesTrack) => (t as any)._source === 'deezer'
      ? `/api/deezer?id=${t.trackId}`
      : `/api/deezer?title=${encodeURIComponent(t.trackName)}&artist=${encodeURIComponent(t.artistName)}`;

    let queueTracks: any[] | undefined;

    if (contextTracks && contextTracks.length > 0) {
      queueTracks = contextTracks.map(t => ({
        id: `stream-${t.trackId}`,
        title: t.trackName,
        artist: t.artistName,
        album: t.collectionName || "",
        coverUrl: t.artworkUrl100?.replace("100x100", "500x500") || "",
        streamUrl: downloadUrl(t),
        previewUrl: t.previewUrl || "",
        downloadedAt: Date.now()
      }));
    }

    playTrack({
      id: `stream-${track.trackId}`,
      title: track.trackName,
      artist: track.artistName,
      album: track.collectionName || "",
      coverUrl: track.artworkUrl100?.replace("100x100", "500x500") || "",
      streamUrl: downloadUrl(track),
      previewUrl: track.previewUrl || "",
      downloadedAt: Date.now(),
    }, queueTracks);
  };

  const handleGenreClick = async (genre: typeof GENRES[0]) => {
    if (selectedGenre === genre.term) { setSelectedGenre(null); setGenreTracks([]); return; }
    setSelectedGenre(genre.term);
    setGenreLoading(true);
    try {
      const topArtist = genre.artists[Math.floor(Math.random() * genre.artists.length)];
      const res = await fetch(`/api/search?term=${encodeURIComponent(topArtist)}`);
      const data = await res.json();
      setGenreTracks(data.results?.slice(0, 12) || []);
    } catch { setGenreTracks([]); }
    setGenreLoading(false);
  };

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Buenos días";
    if (hour < 20) return "Buenas tardes";
    return "Buenas noches";
  };



  return (
    <main className="relative p-4 md:p-8 md:pt-10 max-w-[1400px] mx-auto min-h-screen overflow-hidden">
      {/* Dynamic Background Auras for Premium Feel */}
      <div className="absolute top-0 left-[10%] w-[600px] h-[600px] bg-brand-500/10 rounded-full blur-[140px] -z-10 pointer-events-none" />
      <div className="absolute top-[20%] right-[10%] w-[500px] h-[500px] bg-pink-500/10 rounded-full blur-[140px] -z-10 pointer-events-none" />

      {loading ? (
        <div className="flex flex-col items-center justify-center p-20 gap-4">
          <div className="w-12 h-12 border-4 border-[#1ed760] border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-500 text-sm animate-pulse">Cargando tu música...</p>
        </div>
      ) : (
        <>
          {/* 🎵 TUS PLAYLISTS (Grid Layout for Mobile) */}
          {playlists.length > 0 && (
            <div className="mb-10 lg:mb-12 animate-fade-in-up">
              <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight flex items-center gap-3 mb-6 drop-shadow-lg px-1 md:px-0">
                <ListMusic size={26} className="text-[#1ed760] drop-shadow-[0_0_15px_rgba(30,215,96,0.6)]" /> Tus Playlists
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-5">
                {playlists.slice(0, 8).map((playlist) => (
                  <button key={playlist.id} onClick={() => router.push(`/playlist?id=${playlist.id}`)} aria-label={`Ver playlist ${playlist.name}`}
                    className="flex items-center bg-white/[0.04] hover:bg-white/[0.09] active:scale-[0.98] transition-all duration-300 rounded-[12px] md:rounded-[16px] overflow-hidden group text-left h-[64px] md:h-[72px] shadow-lg md:shadow-xl hover:shadow-brand-500/10 border border-white/[0.02] hover:border-white/[0.08]">
                    <div className="h-full aspect-square flex-shrink-0 bg-slate-800/80 shadow-[4px_0_15px_rgba(0,0,0,0.5)] bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
                      style={playlist.coverBlob ? { backgroundImage: `url(${URL.createObjectURL(playlist.coverBlob)})` } : playlist.coverUrl ? { backgroundImage: `url(${playlist.coverUrl})` } : {}}>
                      {!playlist.coverBlob && !playlist.coverUrl && (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-700 to-slate-800"><ListMusic size={24} className="text-slate-400 group-hover:scale-110 transition-transform" /></div>
                      )}
                    </div>
                    <h3 className="text-white font-bold text-[14px] md:text-[15px] line-clamp-2 px-4 flex-1 drop-shadow-sm group-hover:text-brand-300 transition-colors leading-snug">{playlist.name}</h3>
                  </button>
                ))}
              </div>
            </div>
          )}

          {recommendations.length > 0 && (
            <HorizontalScroller title="Álbumes y sencillos populares" icon={null}>
              {recommendations.map((track) => <TrackCard key={`rec-${track.trackId}`} track={track} size="large" savedTrackIds={savedTrackIds} downloadingId={downloadingId} downloadProgress={downloadProgresses[track.trackId.toString()] || 0} likedIds={likedIds} onPlay={(e, t) => handlePlay(e, t, recommendations)} onDownload={handleDownload} onToggleLike={handleToggleLike} onAlbumClick={(album, artist, cover) => router.push(`/album?name=${encodeURIComponent(album)}&artist=${encodeURIComponent(artist)}&coverUrl=${encodeURIComponent(cover)}`)} onArtistClick={(artist) => router.push(`/artist/${encodeURIComponent(artist)}`)} />)}
            </HorizontalScroller>
          )}

          {/* 📀 MIS ÁLBUMES */}
          {(() => {
            // All tracks grouped by album (threshold > 1 to avoid clutter)
            const albumMap = new Map<string, AlbumGroup>();
            savedTrackIds.size > 0 && Array.from(savedTrackIds).forEach(id => {
              // We need the tracks to group them. Fortunately we have them or can derive them.
              // But on home page we only have IDs mostly. 
              // Wait, in the initial load we had the 'tracks' array. Let's reuse that.
            });

            // Actually let's use the 'albums' state which is already calculated in the useEffect
            const groupedAlbums = albums.filter(a => a.trackCount > 2);
            const hasSaved = savedAlbums.length > 0;
            const hasGrouped = groupedAlbums.length > 0;

            if (!hasSaved && !hasGrouped) return null;

            return (
              <HorizontalScroller title="Mis Álbumes" icon={<Disc3 size={26} className="text-emerald-400 drop-shadow-[0_0_15px_rgba(16,185,129,0.6)]" />}>
                {/* Saved Albums first */}
                {savedAlbums.map((album, idx) => (
                  <button
                    key={`saved-${album.id}`}
                    onClick={() => router.push(`/album?name=${encodeURIComponent(album.name)}&artist=${encodeURIComponent(album.artist)}&coverUrl=${encodeURIComponent(album.coverUrl)}`)}
                    className="min-w-[160px] md:min-w-[200px] w-[160px] md:w-[200px] flex-shrink-0 p-3.5 md:p-4 rounded-[24px] bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.02] hover:border-white/[0.08] transition-all duration-500 ease-out group hover:-translate-y-1.5 hover:shadow-[0_15px_40px_rgba(0,0,0,0.4)] flex flex-col text-left"
                  >
                    <div className="w-full aspect-square rounded-[16px] overflow-hidden shadow-2xl mb-4 bg-[#0a0f1e] border border-white/[0.05]">
                      <img src={album.coverUrl || '/placeholder.png'} alt={album.name} className="w-full h-full object-cover transform transition-transform duration-700 ease-out group-hover:scale-110" />
                    </div>
                    <h3 className="font-bold text-white text-[15px] truncate drop-shadow-sm leading-tight mb-1 group-hover:text-emerald-400 transition-colors">{album.name}</h3>
                    <p className="text-[12px] font-medium text-slate-400 truncate">{album.artist}</p>
                    <span className="text-[10px] text-emerald-500/80 font-bold mt-2 flex items-center gap-1">
                      <Heart size={10} fill="currentColor" /> Guardado
                    </span>
                  </button>
                ))}
                {/* Then Grouped Albums (not in saved) */}
                {groupedAlbums.map((album, idx) => {
                  if (savedAlbums.some(sa => sa.name === album.name && sa.artist === album.artist)) return null;
                  return (
                    <button
                      key={`grouped-${idx}`}
                      onClick={() => router.push(`/album?name=${encodeURIComponent(album.name)}&artist=${encodeURIComponent(album.artist)}&coverUrl=${encodeURIComponent(album.cover)}`)}
                      className="min-w-[160px] md:min-w-[200px] w-[160px] md:w-[200px] flex-shrink-0 p-3.5 md:p-4 rounded-[24px] bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.02] hover:border-white/[0.08] transition-all duration-500 ease-out group hover:-translate-y-1.5 hover:shadow-[0_15px_40px_rgba(0,0,0,0.4)] flex flex-col text-left"
                    >
                      <div className="w-full aspect-square rounded-[16px] overflow-hidden shadow-2xl mb-4 bg-[#0a0f1e] border border-white/[0.05]">
                        <img src={album.cover || '/placeholder.png'} alt={album.name} className="w-full h-full object-cover transform transition-transform duration-700 ease-out group-hover:scale-110" />
                      </div>
                      <h3 className="font-bold text-white text-[15px] truncate drop-shadow-sm leading-tight mb-1 group-hover:text-emerald-400 transition-colors">{album.name}</h3>
                      <p className="text-[12px] font-medium text-slate-400 truncate">{album.artist}</p>
                      <span className="text-[10px] text-slate-500 font-bold mt-2">{album.trackCount} canciones</span>
                    </button>
                  );
                })}
              </HorizontalScroller>
            );
          })()}

          {/* 🎧 GÉNEROS */}
          <section className="mb-12 animate-fade-in-up">
            <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight flex items-center gap-2 md:gap-3 mb-8 drop-shadow-lg px-1 md:px-0">
              <Headphones size={26} className="text-cyan-400 drop-shadow-[0_0_15px_rgba(34,211,238,0.6)]" />Explora por Género
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 md:gap-5">
              {GENRES.map((genre) => (
                <button key={genre.term} onClick={() => handleGenreClick(genre)} aria-label={`Explorar género ${genre.name}`}
                  className={`relative overflow-hidden rounded-2xl aspect-[4/3] md:aspect-square text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-400/50 active:scale-[0.96] transition-all duration-300 group ${selectedGenre === genre.term ? "ring-4 ring-white shadow-[0_10px_40px_rgba(255,255,255,0.2)] scale-[1.02]" : "hover:shadow-2xl hover:-translate-y-1.5"}`}>
                  <div className={`absolute inset-0 bg-gradient-to-br ${genre.color} transition-opacity duration-300`} />
                  <div className="absolute inset-0 bg-black/10 transition-colors duration-300 group-hover:bg-transparent" />
                  <div className="relative z-10 w-full h-full p-4 flex flex-col justify-between">
                    <span className="text-white font-black text-[22px] md:text-2xl drop-shadow-md tracking-tight leading-none max-w-[90%] break-words">
                      {genre.name}
                    </span>
                    <div className="absolute -bottom-4 -right-4 md:-bottom-6 md:-right-6 opacity-20 transform -rotate-12 transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-6">
                      <Music2 size={100} className="text-white drop-shadow-2xl" strokeWidth={1.5} />
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {selectedGenre && (
              <div className="mt-6 animate-modal-in">
                {genreLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <div className="w-8 h-8 border-3 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                ) : genreTracks.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 md:gap-4">
                    {genreTracks.map(track => <TrackCard key={track.trackId} track={track} savedTrackIds={savedTrackIds} downloadingId={downloadingId} downloadProgress={downloadProgresses[track.trackId.toString()] || 0} likedIds={likedIds} onPlay={(e, t) => handlePlay(e, t, genreTracks)} onDownload={handleDownload} onToggleLike={handleToggleLike} onAlbumClick={(album, artist, cover) => router.push(`/album?name=${encodeURIComponent(album)}&artist=${encodeURIComponent(artist)}&coverUrl=${encodeURIComponent(cover)}`)} onArtistClick={(artist) => router.push(`/artist/${encodeURIComponent(artist)}`)} />)}
                  </div>
                ) : (
                  <p className="text-slate-500 text-center py-8">No se encontraron resultados.</p>
                )}
              </div>
            )}
          </section>

          {/* Tus Álbumes removed by user request */}


        </>
      )}

      {user && favoriteArtists === null && (
        <OnboardingModal
          userId={user.id}
          onComplete={async (artists) => {
            setFavoriteArtists(artists);
            if (artists.length > 0) {
              import('@/lib/supabase').then(({ supabase }) => {
                supabase.auth.updateUser({ data: { favorite_artists: artists } });
              });
            }
          }}
        />
      )}
    </main>
  );
}

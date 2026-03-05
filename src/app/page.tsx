"use client";

import { useEffect, useState, useRef } from "react";
import {
  Play, Download, Check, Heart, Disc3,
  ChevronLeft, ChevronRight, TrendingUp,
  Headphones, Music2, Sparkles,
} from "lucide-react";
import { getAllTracksFromDB, toggleLike, getAllLikedTrackIds } from "@/lib/db";
import { downloadAndSaveTrack, ItunesTrack } from "@/lib/download";
import { usePlayer } from "@/context/PlayerContext";
import AlbumDetailModal from "@/components/AlbumDetailModal";
import Logo from "@/components/Logo";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import OnboardingModal from "@/components/OnboardingModal";

const GENRES = [
  { name: "Pop", color: "from-pink-500 to-rose-600", term: "pop" },
  { name: "Reggaeton", color: "from-amber-500 to-orange-600", term: "reggaeton" },
  { name: "Rock", color: "from-red-600 to-rose-900", term: "rock" },
  { name: "Hip Hop", color: "from-violet-600 to-indigo-900", term: "hip hop" },
  { name: "Electrónica", color: "from-cyan-500 to-blue-700", term: "electronic" },
  { name: "R&B", color: "from-fuchsia-500 to-purple-800", term: "r&b" },
  { name: "Latin", color: "from-emerald-500 to-teal-700", term: "latin" },
  { name: "Indie", color: "from-sky-500 to-indigo-700", term: "indie" },
  { name: "Jazz", color: "from-yellow-600 to-amber-900", term: "jazz" },
  { name: "Clásica", color: "from-slate-400 to-slate-700", term: "classical" },
  { name: "Salsa", color: "from-orange-500 to-red-700", term: "salsa" },
  { name: "K-Pop", color: "from-pink-400 to-violet-600", term: "kpop" },
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
  const w = size === "large" ? "min-w-[140px] md:min-w-[200px] w-[140px] md:w-[200px]" : "min-w-[130px] md:min-w-[170px] w-[130px] md:w-[170px]";

  return (
    <div className={`${w} flex-shrink-0 p-3 rounded-2xl bg-white/[0.03] hover:bg-white/[0.07] transition-colors group card-glow flex flex-col`}>
      <div className="relative w-full aspect-square rounded-xl overflow-hidden shadow-xl mb-3 bg-slate-800/50">
        <img src={track.artworkUrl100.replace("100x100", "300x300")} alt={track.trackName}
          className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 md:via-black/20 to-transparent opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-between p-2 md:p-3 pb-2 md:pb-3 rounded-xl pointer-events-none">
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
      <h3 className="text-white font-semibold text-[13px] truncate leading-tight" title={track.trackName}>{track.trackName}</h3>
      <button
        onClick={() => onArtistClick(track.artistName)}
        className="text-slate-400 text-xs truncate mt-0.5 text-left hover:text-brand-400 hover:underline transition-colors outline-none"
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
    <section className="mb-12 animate-fade-in-up">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight flex items-center gap-2 md:gap-3">
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
  const [savedTrackIds, setSavedTrackIds] = useState<Set<string>>(new Set());
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadProgresses, setDownloadProgresses] = useState<Record<string, number>>({});
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [genreTracks, setGenreTracks] = useState<ItunesTrack[]>([]);
  const [genreLoading, setGenreLoading] = useState(false);
  const [albums, setAlbums] = useState<AlbumGroup[]>([]);
  const [albumModal, setAlbumModal] = useState<{
    open: boolean; album: string; artist: string; cover: string;
  }>({ open: false, album: "", artist: "", cover: "" });

  const { playTrack } = usePlayer();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [favoriteArtists, setFavoriteArtists] = useState<string[] | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setFavoriteArtists([]);
    } else {
      const saved = localStorage.getItem(`caleta_artists_${user.id}`);
      if (saved) {
        try {
          setFavoriteArtists(JSON.parse(saved));
        } catch (e) {
          setFavoriteArtists([]);
        }
      }
    }
  }, [user, authLoading]);

  useEffect(() => {
    getAllTracksFromDB().then((tracks) => {
      setSavedTrackIds(new Set(tracks.map((t) => t.id)));
      const albumMap = new Map<string, AlbumGroup>();
      tracks.forEach(t => {
        if (t.album) {
          const key = `${t.album}||${t.artist}`;
          if (!albumMap.has(key)) albumMap.set(key, { name: t.album, artist: t.artist, cover: t.coverUrl, trackCount: 1 });
          else albumMap.get(key)!.trackCount++;
        }
      });
      setAlbums(Array.from(albumMap.values()).sort((a, b) => b.trackCount - a.trackCount));
    });

    getAllLikedTrackIds().then(ids => setLikedIds(new Set(ids)));

    const fetchData = async () => {
      try {
        if (!favoriteArtists) return; // Wait until favorite artists are loaded from onboarding

        const [recRes, trendRes, newRes] = await Promise.all([
          fetch(`/api/search?term=${encodeURIComponent(favoriteArtists[0] || 'top hits 2025')}`),
          fetch(`/api/search?term=${encodeURIComponent(favoriteArtists[1] || TRENDING_TERMS[Math.floor(Math.random() * TRENDING_TERMS.length)])}`),
          fetch(`/api/search?term=${encodeURIComponent(favoriteArtists[2] || 'new music releases')}`)
        ]);

        const [recData, trendData, newData] = await Promise.all([
          recRes.json(), trendRes.json(), newRes.json()
        ]);

        setRecommendations(recData.results?.slice(0, 12) || []);
        setTrending(trendData.results?.slice(0, 12) || []);
        setNewReleases(newData.results?.slice(0, 15) || []);
      } catch (error) { console.error("Error fetching data", error); }
      finally { setLoading(false); }
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
      const res = await fetch(`/api/search?term=${encodeURIComponent(genre.term + " music")}`);
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
    <main className="p-4 md:p-8 max-w-[1400px] mx-auto">
      {/* Hero Header */}
      <header className="mb-12 mt-4 animate-fade-in-up">
        <div className="mb-6 group cursor-pointer inline-block">
          <div className="flex items-center gap-3">
            <Logo size={32} className="shadow-brand-500/30 group-hover:shadow-[0_0_15px_rgba(99,102,241,0.5)] transition-shadow duration-300" />
            <span className="text-brand-400 text-[14px] font-black uppercase tracking-[0.25em] drop-shadow-md group-hover:text-brand-300 transition-colors duration-300">Caleta Music</span>
          </div>
          <p className="text-slate-400/80 text-[11px] md:text-xs italic mt-1.5 ml-11 font-medium tracking-wide">La caleta que suena en todos lados</p>
        </div>
        <h1 className="text-4xl md:text-6xl font-black mb-3 text-white leading-[1.1] tracking-tight drop-shadow-sm">
          {greeting()}
        </h1>
        <p className="text-slate-400 text-lg font-medium drop-shadow-sm">Descubre las canciones más populares hoy.</p>
      </header>

      {loading ? (
        <div className="flex flex-col items-center justify-center p-20 gap-4">
          <div className="w-12 h-12 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-500 text-sm animate-pulse">Cargando tu música...</p>
        </div>
      ) : (
        <>
          {/* 🔥 TENDENCIAS */}
          <HorizontalScroller title="Tendencias" icon={<TrendingUp size={22} className="text-orange-400" />}>
            {trending.map((track) => <TrackCard key={track.trackId} track={track} size="large" savedTrackIds={savedTrackIds} downloadingId={downloadingId} downloadProgress={downloadProgresses[track.trackId.toString()] || 0} likedIds={likedIds} onPlay={(e, t) => handlePlay(e, t, trending)} onDownload={handleDownload} onToggleLike={handleToggleLike} onAlbumClick={(album, artist, cover) => setAlbumModal({ open: true, album, artist, cover })} onArtistClick={(artist) => router.push(`/artist/${encodeURIComponent(artist)}`)} />)}
          </HorizontalScroller>

          {/* 🌟 NUEVOS LANZAMIENTOS */}
          {newReleases.length > 0 && (
            <HorizontalScroller title="Nuevos Lanzamientos" icon={<Sparkles size={22} className="text-yellow-400" />}>
              {newReleases.map((track) => <TrackCard key={track.trackId} track={track} size="large" savedTrackIds={savedTrackIds} downloadingId={downloadingId} downloadProgress={downloadProgresses[track.trackId.toString()] || 0} likedIds={likedIds} onPlay={(e, t) => handlePlay(e, t, newReleases)} onDownload={handleDownload} onToggleLike={handleToggleLike} onAlbumClick={(album, artist, cover) => setAlbumModal({ open: true, album, artist, cover })} onArtistClick={(artist) => router.push(`/artist/${encodeURIComponent(artist)}`)} />)}
            </HorizontalScroller>
          )}

          {/* 🎧 GÉNEROS */}
          <section className="mb-12 animate-fade-in-up">
            <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight flex items-center gap-2 md:gap-3 mb-6">
              <Headphones size={22} className="text-cyan-400" />Explora por Género
            </h2>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
              {GENRES.map((genre) => (
                <button key={genre.term} onClick={() => handleGenreClick(genre)} aria-label={`Explorar género ${genre.name}`}
                  className={`genre-card rounded-3xl p-6 text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/40 active:scale-95 transition-all duration-300 ${selectedGenre === genre.term ? "ring-4 ring-white/50 ring-offset-4 ring-offset-[#0a0f1e] shadow-2xl scale-105" : "hover:shadow-lg"}`}>
                  <div className={`absolute inset-0 bg-gradient-to-br ${genre.color} rounded-3xl opacity-90 transition-opacity group-hover:opacity-100`} />
                  <div className="relative z-10 flex items-center justify-center">
                    <span className="text-white font-bold text-xs md:text-sm drop-shadow-md">{genre.name}</span>
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
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    {genreTracks.map(track => <TrackCard key={track.trackId} track={track} savedTrackIds={savedTrackIds} downloadingId={downloadingId} downloadProgress={downloadProgresses[track.trackId.toString()] || 0} likedIds={likedIds} onPlay={(e, t) => handlePlay(e, t, genreTracks)} onDownload={handleDownload} onToggleLike={handleToggleLike} onAlbumClick={(album, artist, cover) => setAlbumModal({ open: true, album, artist, cover })} onArtistClick={(artist) => router.push(`/artist/${encodeURIComponent(artist)}`)} />)}
                  </div>
                ) : (
                  <p className="text-slate-500 text-center py-8">No se encontraron resultados.</p>
                )}
              </div>
            )}
          </section>

          {/* 💿 ÁLBUMES */}
          {albums.length > 0 && (
            <HorizontalScroller title="Tus Álbumes" icon={<Disc3 size={22} className="text-purple-400" />}>
              {albums.map((album, idx) => {
                const cover = album.cover?.replace("100x100", "300x300")?.replace("200x200", "300x300") || "";
                return (
                  <button key={idx} onClick={() => setAlbumModal({ open: true, album: album.name, artist: album.artist, cover: album.cover })} aria-label={`Ver álbum ${album.name}`}
                    className="min-w-[140px] md:min-w-[170px] w-[140px] md:w-[170px] flex-shrink-0 p-3 rounded-2xl bg-white/[0.03] hover:bg-white/[0.08] transition-all group card-glow text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-400/50 active:scale-[0.98]">
                    <div className="relative w-full aspect-square rounded-xl overflow-hidden shadow-[0_8px_30px_rgba(0,0,0,0.12)] mb-3 bg-slate-800/50">
                      {cover ? <img src={cover} alt={album.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 ease-out" />
                        : <div className="w-full h-full flex items-center justify-center"><Disc3 size={40} className="text-slate-600" /></div>}
                    </div>
                    <h3 className="text-white font-semibold text-[13px] truncate">{album.name}</h3>
                    <p className="text-slate-400 text-xs truncate mt-0.5">{album.artist}</p>
                    <p className="text-slate-500/60 text-[11px] mt-1">{album.trackCount} cancion{album.trackCount !== 1 ? "es" : ""}</p>
                  </button>
                );
              })}
            </HorizontalScroller>
          )}

          {/* 🎶 RECOMENDADO */}
          <section className="mb-12 animate-fade-in-up">
            <h2 className="text-xl md:text-2xl font-bold mb-6 text-white tracking-tight flex items-center gap-2 md:gap-3">
              <Music2 size={22} className="text-brand-400" />Recomendado para ti
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {recommendations.map((track) => <TrackCard key={track.trackId} track={track} savedTrackIds={savedTrackIds} downloadingId={downloadingId} downloadProgress={downloadProgresses[track.trackId.toString()] || 0} likedIds={likedIds} onPlay={(e, t) => handlePlay(e, t, recommendations)} onDownload={handleDownload} onToggleLike={handleToggleLike} onAlbumClick={(album, artist, cover) => setAlbumModal({ open: true, album, artist, cover })} onArtistClick={(artist) => router.push(`/artist/${encodeURIComponent(artist)}`)} />)}
            </div>
          </section>
        </>
      )}

      <AlbumDetailModal
        isOpen={albumModal.open}
        onClose={() => setAlbumModal(prev => ({ ...prev, open: false }))}
        albumName={albumModal.album} artistName={albumModal.artist} coverUrl={albumModal.cover}
      />
      {user && (
        <OnboardingModal
          userId={user.id}
          onComplete={(artists) => setFavoriteArtists(artists)}
        />
      )}
    </main>
  );
}

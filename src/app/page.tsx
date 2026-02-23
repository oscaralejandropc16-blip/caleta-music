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
        <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
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
  const [loading, setLoading] = useState(true);
  const [savedTrackIds, setSavedTrackIds] = useState<Set<string>>(new Set());
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [genreTracks, setGenreTracks] = useState<ItunesTrack[]>([]);
  const [genreLoading, setGenreLoading] = useState(false);
  const [albums, setAlbums] = useState<AlbumGroup[]>([]);
  const [albumModal, setAlbumModal] = useState<{
    open: boolean; album: string; artist: string; cover: string;
  }>({ open: false, album: "", artist: "", cover: "" });

  const { playTrack } = usePlayer();

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
        const recRes = await fetch(`https://itunes.apple.com/search?term=top+hits+2025&entity=song&limit=12`);
        const recData = await recRes.json();
        setRecommendations(recData.results || []);

        const randomArtist = TRENDING_TERMS[Math.floor(Math.random() * TRENDING_TERMS.length)];
        const trendRes = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(randomArtist)}&entity=song&limit=12`);
        const trendData = await trendRes.json();
        setTrending(trendData.results || []);
      } catch (error) { console.error("Error fetching recommendations", error); }
      finally { setLoading(false); }
    };
    fetchData();
  }, []);

  const handleDownload = async (track: ItunesTrack) => {
    const strId = track.trackId.toString();
    setDownloadingId(strId);
    const success = await downloadAndSaveTrack(track, null, strId);
    if (success) setSavedTrackIds((prev) => new Set(prev).add(strId));
    setDownloadingId(null);
  };

  const handleToggleLike = async (e: React.MouseEvent, trackId: string) => {
    e.stopPropagation();
    if (!savedTrackIds.has(trackId)) return;
    const nowLiked = await toggleLike(trackId);
    setLikedIds(prev => { const next = new Set(prev); if (nowLiked) next.add(trackId); else next.delete(trackId); return next; });
  };

  const handleGenreClick = async (genre: typeof GENRES[0]) => {
    if (selectedGenre === genre.term) { setSelectedGenre(null); setGenreTracks([]); return; }
    setSelectedGenre(genre.term);
    setGenreLoading(true);
    try {
      const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(genre.term)}&entity=song&limit=12`);
      const data = await res.json();
      setGenreTracks(data.results || []);
    } catch { setGenreTracks([]); }
    setGenreLoading(false);
  };

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Buenos días";
    if (hour < 20) return "Buenas tardes";
    return "Buenas noches";
  };

  const TrackCard = ({ track, size = "normal" }: { track: ItunesTrack; size?: "normal" | "large" }) => {
    const strId = track.trackId.toString();
    const isDownloaded = savedTrackIds.has(strId);
    const isDownloading = downloadingId === strId;
    const isLiked = likedIds.has(strId);
    const w = size === "large" ? "min-w-[200px] w-[200px]" : "min-w-[170px] w-[170px]";

    return (
      <div className={`${w} flex-shrink-0 p-3 rounded-2xl bg-white/[0.03] hover:bg-white/[0.07] transition-all group card-glow flex flex-col`}>
        <div className="relative w-full aspect-square rounded-xl overflow-hidden shadow-xl mb-3 bg-slate-800/50">
          <img src={track.artworkUrl100.replace("100x100", "300x300")} alt={track.trackName}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
          {/* Overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-between p-3">
            {!isDownloaded ? (
              <button onClick={() => handleDownload(track)} disabled={isDownloading}
                className="bg-brand-500 text-white p-2.5 rounded-full hover:bg-brand-600 transition-all shadow-lg shadow-brand-500/30 disabled:opacity-50 hover:scale-110">
                {isDownloading ? <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Download size={18} />}
              </button>
            ) : (
              <div className="bg-accent text-white p-2.5 rounded-full shadow-lg"><Check size={18} /></div>
            )}
            {isDownloaded && (
              <button onClick={(e) => handleToggleLike(e, strId)}
                className={`p-2 rounded-full transition-all ${isLiked ? "text-pink-500 bg-pink-500/20" : "text-white/70 hover:text-pink-400 bg-white/10"}`}>
                <Heart size={16} fill={isLiked ? "currentColor" : "none"} />
              </button>
            )}
          </div>
        </div>
        <h3 className="text-white font-semibold text-[13px] truncate leading-tight" title={track.trackName}>{track.trackName}</h3>
        <p className="text-slate-400 text-xs truncate mt-0.5">{track.artistName}</p>
        {track.collectionName && (
          <button onClick={() => setAlbumModal({ open: true, album: track.collectionName, artist: track.artistName, cover: track.artworkUrl100 })}
            className="text-slate-500 text-[11px] truncate mt-1 hover:text-brand-400 transition-colors text-left flex items-center gap-1 group/album">
            <Disc3 size={10} className="group-hover/album:animate-spin" /><span className="truncate">{track.collectionName}</span>
          </button>
        )}
      </div>
    );
  };

  return (
    <main className="p-4 md:p-8 max-w-[1400px] mx-auto">
      {/* Hero Header */}
      <header className="mb-12 mt-4 animate-fade-in-up">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={16} className="text-brand-400" />
          <span className="text-brand-400 text-xs font-semibold uppercase tracking-[0.2em]">Caleta Music</span>
        </div>
        <h1 className="text-5xl md:text-6xl font-black mb-3 text-white leading-[1.1] tracking-tight">
          {greeting()}
        </h1>
        <p className="text-slate-400 text-lg font-light">Descubre las canciones más populares hoy.</p>
        <p className="text-slate-500/70 text-sm italic mt-2 font-light">La caleta que suena en todos lados 🎵</p>
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
            {trending.map((track) => <TrackCard key={track.trackId} track={track} size="large" />)}
          </HorizontalScroller>

          {/* 🎧 GÉNEROS */}
          <section className="mb-12 animate-fade-in-up">
            <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3 mb-6">
              <Headphones size={22} className="text-cyan-400" />Explora por Género
            </h2>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
              {GENRES.map((genre) => (
                <button key={genre.term} onClick={() => handleGenreClick(genre)}
                  className={`genre-card rounded-2xl p-5 text-left ${selectedGenre === genre.term ? "ring-2 ring-white/30 ring-offset-2 ring-offset-[#0a0f1e]" : ""}`}>
                  <div className={`absolute inset-0 bg-gradient-to-br ${genre.color} rounded-2xl`} />
                  <div className="relative z-10">
                    <span className="text-white font-bold text-sm drop-shadow-md">{genre.name}</span>
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
                    {genreTracks.map(track => <TrackCard key={track.trackId} track={track} />)}
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
                  <button key={idx} onClick={() => setAlbumModal({ open: true, album: album.name, artist: album.artist, cover: album.cover })}
                    className="min-w-[170px] w-[170px] flex-shrink-0 p-3 rounded-2xl bg-white/[0.03] hover:bg-white/[0.07] transition-all group card-glow text-left">
                    <div className="w-full aspect-square rounded-xl overflow-hidden shadow-xl mb-3 bg-slate-800/50">
                      {cover ? <img src={cover} alt={album.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
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
            <h2 className="text-2xl font-bold mb-6 text-white tracking-tight flex items-center gap-3">
              <Music2 size={22} className="text-brand-400" />Recomendado para ti
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {recommendations.map((track) => <TrackCard key={track.trackId} track={track} />)}
            </div>
          </section>
        </>
      )}

      <AlbumDetailModal
        isOpen={albumModal.open}
        onClose={() => setAlbumModal(prev => ({ ...prev, open: false }))}
        albumName={albumModal.album} artistName={albumModal.artist} coverUrl={albumModal.cover}
      />
    </main>
  );
}

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
    Search, Download, Check, CheckCircle, XCircle, Loader, SearchX,
    Music, RefreshCw, Disc3, Play, Link2, Sparkles, TrendingUp, Headphones
} from "lucide-react";
import { getAllTracksFromDB } from "@/lib/db";
import { downloadAndSaveTrack, ItunesTrack } from "@/lib/download";
import { usePlayer } from "@/context/PlayerContext";
import AlbumDetailModal from "@/components/AlbumDetailModal";
import { useRouter } from "next/navigation";

import toast from 'react-hot-toast';

interface AlbumGroup {
    name: string;
    artist: string;
    cover: string;
    trackCount: number;
}

const SUGGESTIONS = [
    { label: "Shakira", icon: <Sparkles size={14} /> },
    { label: "Bad Bunny", icon: <TrendingUp size={14} /> },
    { label: "Peso Pluma", icon: <TrendingUp size={14} /> },
    { label: "Taylor Swift", icon: <Sparkles size={14} /> },
    { label: "Dua Lipa", icon: <Headphones size={14} /> },
    { label: "Karol G", icon: <Sparkles size={14} /> },
    { label: "Drake", icon: <Headphones size={14} /> },
    { label: "The Weeknd", icon: <Headphones size={14} /> },
];

export default function SearchPage() {
    const router = useRouter();
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<ItunesTrack[]>([]);
    const [loading, setLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [linkInput, setLinkInput] = useState("");
    const [downloadingId, setDownloadingId] = useState<string | null>(null);
    const [activeLinkId, setActiveLinkId] = useState<string | null>(null);
    const [downloadProgresses, setDownloadProgresses] = useState<Record<string, number>>({});
    const [linkDownloading, setLinkDownloading] = useState(false);
    const [savedTrackIds, setSavedTrackIds] = useState<Set<string>>(new Set());
    const [searchError, setSearchError] = useState(false);
    const [viewMode, setViewMode] = useState<"songs" | "albums">("songs");
    const searchInputRef = useRef<HTMLInputElement>(null);

    const [albumModal, setAlbumModal] = useState<{
        open: boolean; album: string; artist: string; cover: string;
    }>({ open: false, album: "", artist: "", cover: "" });

    useEffect(() => {
        getAllTracksFromDB().then((tracks) => {
            setSavedTrackIds(new Set(tracks.map((t) => t.id)));
        });
    }, []);

    const { playTrack } = usePlayer();

    const handlePlay = (track: ItunesTrack) => {
        const downloadUrl = (t: ItunesTrack) => (t as any)._source === 'deezer'
            ? `/api/deezer?id=${t.trackId}`
            : `/api/deezer?title=${encodeURIComponent(t.trackName)}&artist=${encodeURIComponent(t.artistName)}`;

        const queueTracks = results.map(t => ({
            id: `stream-${t.trackId}`,
            title: t.trackName,
            artist: t.artistName,
            album: t.collectionName || "",
            coverUrl: t.artworkUrl100?.replace("100x100", "500x500") || "",
            streamUrl: downloadUrl(t),
            previewUrl: t.previewUrl || "",
            downloadedAt: Date.now()
        }));

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

    const handleDownload = (track: ItunesTrack | null, url: string | null, id: string) => {
        if (downloadingId === id) return; // ya descargando
        setDownloadingId(id);

        const trackName = track?.trackName || "enlace";
        const loadingToastId = toast.loading(`Descargando "${trackName}"...`);

        // Descarga en background — no bloqueamos la UI
        downloadAndSaveTrack(track, url, id, (progress) => {
            setDownloadProgresses(prev => ({ ...prev, [id]: progress }));
        }).then(result => {
            toast.dismiss(loadingToastId);
            if (result.success) {
                setSavedTrackIds((prev) => new Set(prev).add(id));
                toast.success(`"${trackName}" descargada ✓`);
            } else {
                toast.error(`Error: ${result.error || "Desconocido"}`);
            }
            setDownloadingId(prev => prev === id ? null : prev);
        });
    };

    const executeLinkDownload = async (url: string) => {
        if (linkDownloading) return;
        const directId = `link-${Date.now()}`;
        setLinkDownloading(true);
        setActiveLinkId(directId);

        // Limpiar la barra de busqueda principal para que no se quede con el link largo
        setQuery("");

        const result = await downloadAndSaveTrack(null, url, directId, (progress) => {
            setDownloadProgresses(prev => ({ ...prev, [directId]: progress }));
        });

        if (result.success) {
            setSavedTrackIds((prev) => new Set(prev).add(directId));
            toast.success("¡Descarga completada y guardada!");
        } else {
            toast.error(`Error: ${result.error || "Verifica el enlace"}`);
        }
        setLinkDownloading(false);
        setActiveLinkId(null);
    };

    const doSearch = useCallback(async (term: string) => {
        setLoading(true);
        setHasSearched(true);
        setSearchTerm(term);
        setSearchError(false);
        try {
            const response = await fetch(
                `/api/search?term=${encodeURIComponent(term)}`
            );
            const data = await response.json();
            setResults(data.results || []);
        } catch (error) {
            console.error("Error fetching from iTunes:", error);
            setSearchError(true);
            setResults([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (typeof window !== "undefined") {
            const urlParams = new URLSearchParams(window.location.search);
            const q = urlParams.get("q");
            if (q) {
                setQuery(q);
                doSearch(q);
            }
        }
    }, [doSearch]);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = query.trim();
        if (!trimmed) return;

        // Si el usuario pega un link directo (youtube, etc) en la barra principal
        if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
            executeLinkDownload(trimmed);
            return;
        }

        doSearch(trimmed);
    };

    // Group results by album
    const albumGroups: AlbumGroup[] = [];
    const albumMap = new Map<string, AlbumGroup>();
    results.forEach(track => {
        if (track.collectionName) {
            const key = `${track.collectionName}||${track.artistName}`;
            if (!albumMap.has(key)) {
                albumMap.set(key, {
                    name: track.collectionName,
                    artist: track.artistName,
                    cover: track.artworkUrl100,
                    trackCount: 1,
                });
            } else {
                albumMap.get(key)!.trackCount++;
            }
        }
    });
    albumMap.forEach(v => albumGroups.push(v));

    const formatDuration = (ms: number) => {
        const mins = Math.floor(ms / 60000);
        const secs = Math.floor((ms % 60000) / 1000);
        return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
    };

    return (
        <main className="p-4 md:p-8 max-w-7xl mx-auto pb-32">

            {/* ═══ Hero Header ═══ */}
            <header className="mb-10 animate-fade-in-up relative">
                <div className="absolute -top-20 -left-20 w-72 h-72 bg-brand-500/10 rounded-full blur-[120px] pointer-events-none" />
                <div className="absolute -top-10 right-0 w-56 h-56 bg-pink-500/8 rounded-full blur-[100px] pointer-events-none" />

                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2.5 rounded-2xl bg-brand-500/10 border border-brand-500/20">
                            <Search size={22} className="text-brand-400" />
                        </div>
                        <span className="text-xs font-black uppercase tracking-[0.25em] text-brand-400 drop-shadow-sm">Explorar</span>
                    </div>
                    <h1 className="text-3xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-white to-slate-400 mb-3 leading-tight">
                        Buscar y Descargar
                    </h1>
                    <p className="text-slate-400 text-base md:text-lg font-medium max-w-xl">
                        Encuentra cualquier canción, artista o álbum. ¿No la consigues? <span className="text-pink-400">Pegar un enlace de YouTube</span> funciona también.
                    </p>
                </div>
            </header>

            {/* ═══ Search Section ═══ */}
            <section className="mb-10 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>

                {/* Main Search Bar */}
                <form onSubmit={handleSearch} className="relative group mb-4">
                    <div className="absolute -inset-1 bg-gradient-to-r from-brand-500/20 via-purple-500/10 to-pink-500/20 rounded-[2rem] blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-500 pointer-events-none" />
                    <div className="relative flex items-center">
                        <div className="absolute left-6 text-slate-400 group-focus-within:text-brand-400 transition-colors duration-300 z-10">
                            <Search size={22} />
                        </div>
                        <input
                            ref={searchInputRef}
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Busca una canción, artista, o pega un link de YouTube..."
                            className="w-full bg-[#0c1225]/80 backdrop-blur-xl border border-white/[0.08] rounded-2xl py-4 md:py-5 pl-12 md:pl-16 pr-[90px] md:pr-40 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500/30 transition-all text-base md:text-lg font-medium shadow-[0_8px_40px_-15px_rgba(0,0,0,0.5)] light-mode:bg-white/80 light-mode:text-slate-900 light-mode:border-slate-200"
                        />
                        <button
                            type="submit"
                            disabled={loading || !query.trim()}
                            className="absolute right-2 md:right-3 bg-brand-500 hover:bg-brand-400 disabled:bg-brand-500/50 disabled:hover:bg-brand-500/50 px-4 md:px-7 py-2 md:py-3 rounded-xl font-bold transition-all duration-300 active:scale-95 shadow-[0_4px_20px_rgba(99,102,241,0.3)] hover:shadow-[0_6px_25px_rgba(99,102,241,0.5)] min-w-[70px] md:min-w-[110px] outline-none focus-visible:ring-4 focus-visible:ring-brand-400/50 text-white text-sm md:text-base disabled:cursor-not-allowed"
                        >
                            {loading ? <div className="h-4 w-4 md:h-5 md:w-5 border-2 border-white rounded-full animate-spin border-t-transparent mx-auto" /> : "Buscar"}
                        </button>
                    </div>
                </form>



                {linkDownloading && activeLinkId && (
                    <div className="mb-4 animate-fade-in-up">
                        <div className="flex items-center gap-3 text-sm text-brand-400 mb-2">
                            <Loader size={16} className="animate-spin" />
                            <span className="font-medium">Descargando enlace... {downloadProgresses[activeLinkId] || 0}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-brand-600 to-brand-400 rounded-full transition-all duration-300" style={{ width: `${downloadProgresses[activeLinkId] || 0}%` }} />
                        </div>
                    </div>
                )}

                {/* Quick suggestion chips (show when no search done yet) */}
                {!hasSearched && !loading && (
                    <div className="animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
                        <p className="text-slate-500 text-xs uppercase tracking-[0.2em] font-bold mb-3 ml-1">Búsquedas populares</p>
                        <div className="flex flex-wrap gap-2">
                            {SUGGESTIONS.map((s) => (
                                <button
                                    key={s.label}
                                    onClick={() => { setQuery(s.label); doSearch(s.label); }}
                                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06] text-slate-300 text-sm font-semibold hover:bg-brand-500/10 hover:border-brand-500/20 hover:text-brand-300 transition-all duration-300 active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
                                >
                                    {s.icon}
                                    {s.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </section>

            {/* ═══ Loading State ═══ */}
            {loading && (
                <div className="flex flex-col items-center justify-center py-24 animate-fade-in-up">
                    <div className="relative mb-6">
                        <div className="w-20 h-20 border-4 border-brand-500/20 rounded-full" />
                        <div className="absolute inset-0 w-20 h-20 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
                        <div className="absolute inset-0 flex items-center justify-center">
                            <Music size={24} className="text-brand-400" />
                        </div>
                    </div>
                    <p className="text-white text-xl font-bold mb-1">Buscando &quot;{query}&quot;</p>
                    <p className="text-slate-500 text-sm font-medium">Explorando millones de canciones...</p>
                </div>
            )}

            {/* ═══ No Results ═══ */}
            {!loading && hasSearched && results.length === 0 && !searchError && (
                <div className="flex flex-col items-center justify-center py-20 animate-fade-in-up">
                    <div className="relative mb-8">
                        <div className="w-28 h-28 rounded-3xl bg-slate-800/50 border border-slate-700/30 flex items-center justify-center rotate-6">
                            <SearchX size={44} className="text-slate-500 -rotate-6" strokeWidth={1.5} />
                        </div>
                    </div>
                    <h3 className="text-2xl font-black text-white mb-2">Sin resultados</h3>
                    <p className="text-slate-400 text-center max-w-md mb-2 font-medium">
                        No encontramos nada para <span className="text-brand-400 font-bold">&quot;{searchTerm}&quot;</span>
                    </p>
                    <p className="text-slate-500 text-sm text-center max-w-md mb-6">
                        Intenta con otro nombre de canción, artista o álbum. Si la música es muy nueva o poco común, ¡pega el enlace directo de YouTube en la barra de búsqueda de arriba!
                    </p>
                    <div className="text-center">
                        <p className="text-slate-500 text-xs uppercase tracking-[0.2em] font-bold mb-3">Prueba buscando</p>
                        <div className="flex flex-wrap justify-center gap-2">
                            {SUGGESTIONS.slice(0, 6).map((s) => (
                                <button key={s.label} onClick={() => { setQuery(s.label); doSearch(s.label); }}
                                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06] text-slate-300 text-sm font-semibold hover:bg-brand-500/10 hover:border-brand-500/20 hover:text-brand-300 transition-all duration-300 active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40">
                                    {s.icon} {s.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ Error State ═══ */}
            {!loading && hasSearched && searchError && (
                <div className="flex flex-col items-center justify-center py-20 animate-fade-in-up">
                    <div className="w-24 h-24 rounded-3xl bg-red-500/10 border border-red-500/15 flex items-center justify-center mb-6 rotate-3">
                        <XCircle size={40} className="text-red-400 -rotate-3" />
                    </div>
                    <h3 className="text-2xl font-black text-white mb-2">Error de conexión</h3>
                    <p className="text-slate-400 text-center max-w-md mb-6 font-medium">No pudimos conectar con el servidor de búsqueda.</p>
                    <button onClick={() => doSearch(searchTerm)}
                        className="flex items-center gap-2 px-7 py-3.5 rounded-xl bg-brand-500 hover:bg-brand-400 text-white font-bold transition-all hover:scale-105 active:scale-95 shadow-[0_4px_20px_rgba(99,102,241,0.3)] outline-none focus-visible:ring-4 focus-visible:ring-brand-400/50">
                        <RefreshCw size={18} /> Reintentar
                    </button>
                </div>
            )}

            {/* ═══ Results ═══ */}
            {!loading && results.length > 0 && (
                <section className="animate-fade-in-up">
                    {/* Results header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                        <p className="text-slate-400 text-sm font-medium">
                            <span className="text-white font-bold text-lg mr-1">{results.length}</span>
                            resultados para <span className="text-brand-400 font-semibold">&quot;{searchTerm}&quot;</span>
                        </p>

                        {/* View tabs */}
                        <div className="flex bg-white/[0.04] rounded-xl p-1 border border-white/[0.06]">
                            <button onClick={() => setViewMode("songs")}
                                className={`px-5 py-2 rounded-lg text-sm font-bold transition-all duration-300 flex items-center gap-2 ${viewMode === "songs"
                                    ? "bg-brand-500 text-white shadow-[0_2px_15px_rgba(99,102,241,0.3)]"
                                    : "text-slate-400 hover:text-white"
                                    }`}>
                                <Music size={15} /> Canciones
                            </button>
                            <button onClick={() => setViewMode("albums")}
                                className={`px-5 py-2 rounded-lg text-sm font-bold transition-all duration-300 flex items-center gap-2 ${viewMode === "albums"
                                    ? "bg-brand-500 text-white shadow-[0_2px_15px_rgba(99,102,241,0.3)]"
                                    : "text-slate-400 hover:text-white"
                                    }`}>
                                <Disc3 size={15} /> Álbumes ({albumGroups.length})
                            </button>
                        </div>
                    </div>

                    {/* ═══ Songs View ═══ */}
                    {viewMode === "songs" && (
                        <div className="flex flex-col gap-2">
                            {results.map((track, idx) => {
                                const strId = track.trackId.toString();
                                const isDownloaded = savedTrackIds.has(strId);
                                const isDownloading = downloadingId === strId;
                                const progress = downloadProgresses[strId] || 0;

                                return (
                                    <div
                                        key={track.trackId}
                                        className="group flex items-center gap-4 px-4 py-3 rounded-2xl hover:bg-white/[0.04] transition-all duration-300 cursor-pointer active:scale-[0.99]"
                                        onClick={() => handlePlay(track)}
                                    >
                                        {/* Track number */}
                                        <div className="w-8 text-center flex-shrink-0 relative">
                                            <span className="text-[13px] font-bold text-slate-500 group-hover:opacity-0 transition-opacity">
                                                {idx + 1}
                                            </span>
                                            <Play size={14} fill="currentColor" className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                        </div>

                                        {/* Artwork */}
                                        <div className="relative w-12 h-12 flex-shrink-0">
                                            <img
                                                src={track.artworkUrl100.replace("100x100", "200x200")}
                                                alt=""
                                                className="w-full h-full rounded-lg object-cover shadow-[0_4px_12px_rgba(0,0,0,0.3)] transition-all duration-300 group-hover:shadow-[0_4px_20px_rgba(99,102,241,0.2)]"
                                                loading="lazy"
                                            />
                                        </div>

                                        {/* Track info */}
                                        <div className="flex-1 min-w-0 pr-2">
                                            <p className="text-[15px] font-bold text-white truncate group-hover:text-brand-300 transition-colors drop-shadow-sm" title={track.trackName}>
                                                {track.trackName}
                                            </p>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); router.push(`/artist/${encodeURIComponent(track.artistName)}`); }}
                                                    className="text-slate-400 font-medium text-[13px] truncate hover:text-brand-400 hover:underline transition-colors outline-none text-left"
                                                    title={track.artistName}
                                                >
                                                    {track.artistName}
                                                </button>
                                                {track.collectionName && (
                                                    <>
                                                        <span className="text-slate-600 text-[10px]">•</span>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); setAlbumModal({ open: true, album: track.collectionName, artist: track.artistName, cover: track.artworkUrl100 }); }}
                                                            className="text-slate-500 text-[12px] truncate hover:text-brand-400 transition-colors outline-none flex items-center gap-1 font-medium"
                                                        >
                                                            <Disc3 size={10} />
                                                            <span className="truncate max-w-[150px]">{track.collectionName}</span>
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>

                                        {/* Duration */}
                                        <span className="text-xs font-medium text-slate-500 flex-shrink-0 hidden sm:block tabular-nums mr-2">
                                            {track.trackTimeMillis ? formatDuration(track.trackTimeMillis) : ""}
                                        </span>

                                        {/* Actions */}
                                        <div className="flex gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                                            <button
                                                className={`p-2.5 rounded-full transition-all duration-300 active:scale-90 outline-none focus-visible:ring-2 focus-visible:ring-brand-400/50 ${isDownloaded
                                                    ? "text-green-500 bg-green-500/10 cursor-default"
                                                    : isDownloading
                                                        ? "text-brand-400"
                                                        : "text-slate-500 hover:text-brand-400 hover:bg-brand-500/10 opacity-100 md:opacity-0 md:group-hover:opacity-100"
                                                    }`}
                                                onClick={() => { if (!isDownloaded && !isDownloading) handleDownload(track, null, strId); }}
                                                disabled={isDownloading || isDownloaded}
                                                title={isDownloaded ? "Ya descargado" : "Descargar"}
                                                aria-label={isDownloaded ? "Ya descargado" : `Descargar ${track.trackName}`}
                                            >
                                                {isDownloading ? (
                                                    <div className="relative w-full h-full flex items-center justify-center">
                                                        <svg className="w-[36px] h-[36px] -rotate-90 transform absolute" viewBox="0 0 36 36" style={{ top: -7, left: -7 }}>
                                                            <path className="text-white/10 stroke-current" strokeWidth="2.5" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                                                            <path className="text-brand-400 stroke-current transition-all duration-300" strokeWidth="2.5" strokeDasharray={`${progress}, 100`} fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                                                        </svg>
                                                        <span className="text-[10px] font-bold text-brand-400 leading-none">{progress > 0 ? `${progress}` : <Loader size={14} className="animate-spin" />}</span>
                                                    </div>
                                                ) : isDownloaded ? <Check size={18} strokeWidth={2.5} /> : <Download size={18} />}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* ═══ Albums View ═══ */}
                    {viewMode === "albums" && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                            {albumGroups.map((album, idx) => {
                                const cover = album.cover?.replace("100x100", "300x300") || "";
                                return (
                                    <button
                                        key={idx}
                                        aria-label={`Explorar álbum ${album.name}`}
                                        onClick={() => setAlbumModal({ open: true, album: album.name, artist: album.artist, cover: album.cover })}
                                        className="bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.04] hover:border-white/[0.08] rounded-2xl p-4 text-left transition-all duration-300 group active:scale-[0.98] outline-none focus-visible:ring-4 focus-visible:ring-brand-500/40"
                                    >
                                        <div className="w-full aspect-square rounded-xl overflow-hidden shadow-[0_12px_30px_rgba(0,0,0,0.3)] mb-4 bg-slate-800/80">
                                            {cover ? (
                                                <img src={cover} alt={album.name} className="w-full h-full object-cover transform transition-transform duration-700 ease-out group-hover:scale-110" loading="lazy" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center">
                                                    <Disc3 size={40} className="text-slate-600" />
                                                </div>
                                            )}
                                        </div>
                                        <h3 className="text-white font-bold text-sm truncate drop-shadow-sm group-hover:text-brand-300 transition-colors">{album.name}</h3>
                                        <p className="text-slate-400 font-medium text-xs truncate mt-0.5">{album.artist}</p>
                                        <p className="text-slate-500/70 font-bold text-[10px] mt-1.5 uppercase tracking-wide">
                                            {album.trackCount} cancion{album.trackCount !== 1 ? "es" : ""}
                                        </p>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </section>
            )}

            {/* ═══ Album Detail Modal ═══ */}
            <AlbumDetailModal
                isOpen={albumModal.open}
                onClose={() => setAlbumModal(prev => ({ ...prev, open: false }))}
                albumName={albumModal.album}
                artistName={albumModal.artist}
                coverUrl={albumModal.cover}
            />
        </main>
    );
}

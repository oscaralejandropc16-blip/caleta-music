"use client";

import { useState, useEffect } from "react";
import { X, Play, Heart, Music, Download, Check, Disc3, Loader, DownloadCloud, Calendar, Tag, Copyright, Clock } from "lucide-react";
import { SavedTrack, getAllTracksFromDB, isTrackLiked, toggleLike } from "@/lib/db";
import { downloadAndSaveTrack, ItunesTrack } from "@/lib/download";
import { usePlayer } from "@/context/PlayerContext";

interface AlbumMeta {
    releaseDate: string;
    primaryGenreName: string;
    copyright: string;
    trackCount: number;
    collectionType: string;
    contentAdvisoryRating: string;
    collectionPrice: number;
    currency: string;
    country: string;
}

interface AlbumDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    albumName: string;
    artistName: string;
    coverUrl: string;
}

export default function AlbumDetailModal({
    isOpen,
    onClose,
    albumName,
    artistName,
    coverUrl,
}: AlbumDetailModalProps) {
    const [itunesTracks, setItunesTracks] = useState<ItunesTrack[]>([]);
    const [albumMeta, setAlbumMeta] = useState<AlbumMeta | null>(null);
    const [savedTrackIds, setSavedTrackIds] = useState<Set<string>>(new Set());
    const [likedMap, setLikedMap] = useState<Record<string, boolean>>({});
    const [loading, setLoading] = useState(true);
    const [downloadingId, setDownloadingId] = useState<string | null>(null);
    const [downloadProgresses, setDownloadProgresses] = useState<Record<string, number>>({});
    const [downloadingAll, setDownloadingAll] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState(0);
    const { playTrack, currentTrack, isPlaying, isLoading } = usePlayer();

    useEffect(() => {
        if (!isOpen || !albumName) return;

        const loadAlbum = async () => {
            setLoading(true);
            setItunesTracks([]);
            setAlbumMeta(null);

            try {
                // Step 1: Search for the album to get collectionId
                const searchRes = await fetch(
                    `https://itunes.apple.com/search?term=${encodeURIComponent(albumName + " " + artistName)}&entity=album&limit=10`
                );
                const searchData = await searchRes.json();

                const albums = searchData.results || [];
                // Try exact match first, then partial
                const matchedAlbum = albums.find(
                    (a: any) => a.collectionName?.toLowerCase() === albumName.toLowerCase()
                ) || albums.find(
                    (a: any) => a.collectionName?.toLowerCase().includes(albumName.toLowerCase()) ||
                        albumName.toLowerCase().includes(a.collectionName?.toLowerCase() || "")
                ) || albums[0];

                if (matchedAlbum && matchedAlbum.collectionId) {
                    // Step 2: Use lookup API to get ALL tracks + album metadata
                    const lookupRes = await fetch(
                        `https://itunes.apple.com/lookup?id=${matchedAlbum.collectionId}&entity=song`
                    );
                    const lookupData = await lookupRes.json();
                    const results = lookupData.results || [];

                    // First result is the collection (album) wrapper with metadata
                    const collectionWrapper = results.find((r: any) => r.wrapperType === "collection");
                    if (collectionWrapper) {
                        setAlbumMeta({
                            releaseDate: collectionWrapper.releaseDate || "",
                            primaryGenreName: collectionWrapper.primaryGenreName || "",
                            copyright: collectionWrapper.copyright || "",
                            trackCount: collectionWrapper.trackCount || 0,
                            collectionType: collectionWrapper.collectionType || "Album",
                            contentAdvisoryRating: collectionWrapper.contentAdvisoryRating || "",
                            collectionPrice: collectionWrapper.collectionPrice || 0,
                            currency: collectionWrapper.currency || "USD",
                            country: collectionWrapper.country || "",
                        });
                    }

                    // Remaining results are the tracks
                    const tracks = results
                        .filter((r: any) => r.wrapperType === "track" && r.kind === "song")
                        .sort((a: any, b: any) => (a.discNumber || 1) * 100 + (a.trackNumber || 0) - ((b.discNumber || 1) * 100 + (b.trackNumber || 0)));

                    setItunesTracks(tracks);
                } else {
                    // Fallback: regular search
                    const fallbackRes = await fetch(
                        `https://itunes.apple.com/search?term=${encodeURIComponent(albumName)}&entity=song&limit=30`
                    );
                    const fallbackData = await fallbackRes.json();
                    const filtered = (fallbackData.results || []).filter(
                        (t: ItunesTrack) => t.collectionName?.toLowerCase() === albumName.toLowerCase()
                    );
                    setItunesTracks(filtered.length > 0 ? filtered : fallbackData.results || []);
                }
            } catch (err) {
                console.error("Error loading album:", err);
            }

            // Load saved tracks
            const saved = await getAllTracksFromDB();
            setSavedTrackIds(new Set(saved.map(s => s.id)));

            const likes: Record<string, boolean> = {};
            for (const s of saved) {
                likes[s.id] = await isTrackLiked(s.id);
            }
            setLikedMap(likes);

            setLoading(false);
        };

        loadAlbum();
    }, [isOpen, albumName, artistName]);

    if (!isOpen) return null;

    const handleToggleLike = async (e: React.MouseEvent, trackId: string) => {
        e.stopPropagation();
        const newState = await toggleLike(trackId);
        setLikedMap(prev => ({ ...prev, [trackId]: newState }));
    };

    const handleDownload = async (track: ItunesTrack) => {
        const strId = track.trackId.toString();
        setDownloadingId(strId);
        const success = await downloadAndSaveTrack(track, null, strId, (progress) => {
            setDownloadProgresses(prev => ({ ...prev, [strId]: progress }));
        });
        if (success) {
            setSavedTrackIds(prev => new Set(prev).add(strId));
        }
        setDownloadingId(null);
    };

    const toSavedTrack = (t: ItunesTrack) => ({
        id: `stream-${t.trackId}`,
        title: t.trackName,
        artist: t.artistName,
        album: t.collectionName || "",
        coverUrl: t.artworkUrl100?.replace("100x100", "500x500") || "",
        streamUrl: `/api/download?title=${encodeURIComponent(t.trackName)}&artist=${encodeURIComponent(t.artistName)}&stream=true`,
        downloadedAt: Date.now(),
    });

    const handlePlayTrack = (track: ItunesTrack) => {
        const albumQueue = itunesTracks.map(toSavedTrack);
        const currentSaved = toSavedTrack(track);
        playTrack(currentSaved, albumQueue);
    };

    const handleDownloadAll = async () => {
        const tracksToDownload = itunesTracks.filter(
            t => !savedTrackIds.has(t.trackId.toString())
        );
        if (tracksToDownload.length === 0) return;

        setDownloadingAll(true);
        setDownloadProgress(0);

        for (let i = 0; i < tracksToDownload.length; i++) {
            const track = tracksToDownload[i];
            const strId = track.trackId.toString();
            setDownloadingId(strId);
            const success = await downloadAndSaveTrack(track, null, strId);
            if (success) {
                setSavedTrackIds(prev => new Set(prev).add(strId));
            }
            setDownloadProgress(Math.round(((i + 1) / tracksToDownload.length) * 100));
        }

        setDownloadingId(null);
        setDownloadingAll(false);
    };

    const largeCover = coverUrl?.replace("100x100", "600x600")?.replace("200x200", "600x600") || "";

    const formatDuration = (ms: number) => {
        const mins = Math.floor(ms / 60000);
        const secs = Math.floor((ms % 60000) / 1000);
        return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
    };

    const totalDurationMs = itunesTracks.reduce((sum, t) => sum + (t.trackTimeMillis || 0), 0);
    const totalMins = Math.floor(totalDurationMs / 60000);

    const releaseYear = albumMeta?.releaseDate ? new Date(albumMeta.releaseDate).getFullYear() : null;
    const releaseFullDate = albumMeta?.releaseDate
        ? new Date(albumMeta.releaseDate).toLocaleDateString("es", { year: "numeric", month: "long", day: "numeric" })
        : null;

    const isSingle = albumMeta?.collectionType === "Single" || albumName.toLowerCase().includes("single");

    const notDownloadedCount = itunesTracks.filter(t => !savedTrackIds.has(t.trackId.toString())).length;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-[#060913]/80 backdrop-blur-3xl transition-opacity animate-fade-in" onClick={onClose} />

            <div className="relative z-10 w-full max-w-3xl max-h-[85vh] bg-[#060913]/90 backdrop-blur-2xl border border-white/[0.08] shadow-[0_20px_50px_rgba(0,0,0,0.5)] md:rounded-[2rem] flex flex-col overflow-hidden animate-slideIn">
                {/* Header */}
                <div className="relative">
                    <div
                        className="absolute inset-0 opacity-50 blur-[50px] scale-125 transform-gpu saturate-150"
                        style={{
                            backgroundImage: `url(${largeCover})`,
                            backgroundSize: "cover",
                            backgroundPosition: "center",
                        }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-[#060913]/40 via-[#060913]/80 to-[#060913]" />

                    <button
                        onClick={(e) => { e.stopPropagation(); onClose(); }}
                        aria-label="Cerrar modal"
                        className="absolute top-5 right-5 z-20 p-2.5 rounded-full bg-white/5 hover:bg-white/15 backdrop-blur-md border border-white/10 text-white/70 hover:text-white transition-all duration-300 shadow-lg hover:shadow-[0_0_15px_rgba(255,255,255,0.1)] active:scale-90 outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
                    >
                        <X size={20} strokeWidth={2.5} />
                    </button>

                    <div className="relative z-10 flex flex-col md:flex-row items-center md:items-end gap-6 px-8 pt-10 pb-6">
                        <div className="w-40 h-40 md:w-48 md:h-48 rounded-[2rem] overflow-hidden shadow-[0_15px_40px_rgba(0,0,0,0.5)] flex-shrink-0 bg-slate-800 border border-white/[0.08] group relative">
                            {largeCover ? (
                                <img src={largeCover} alt={albumName} className="w-full h-full object-cover transform transition-transform duration-700 ease-out group-hover:scale-110" />
                            ) : (
                                <div className="w-full h-full bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center transform transition-transform duration-700 ease-out group-hover:scale-105">
                                    <Disc3 size={60} className="text-slate-600 drop-shadow-lg" strokeWidth={1} />
                                </div>
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                        </div>
                        <div className="flex-1 min-w-0 pb-2 text-center md:text-left flex flex-col items-center md:items-start">
                            {/* Type badge */}
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-xs text-brand-400 font-black uppercase tracking-[0.25em] drop-shadow-sm">
                                    {isSingle ? "Single" : "Álbum"}
                                </span>
                                {albumMeta?.contentAdvisoryRating === "Explicit" && (
                                    <span className="text-[9px] font-black bg-white/15 backdrop-blur-md text-white px-1.5 py-0.5 rounded-sm border border-white/10 shadow-sm" title="Explicit">E</span>
                                )}
                            </div>
                            <h2 className="text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-300 leading-tight mb-2 line-clamp-2 drop-shadow-md pb-1 w-full" title={albumName}>
                                {albumName || "Álbum desconocido"}
                            </h2>
                            <p className="text-slate-300 md:text-xl font-medium drop-shadow-sm hover:text-white transition-colors cursor-default">{artistName}</p>

                            {/* Metadata row */}
                            <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 mt-4 text-[12px] font-semibold text-slate-400">
                                {releaseFullDate && (
                                    <span className="flex items-center gap-1.5 bg-white/[0.06] px-3 py-1.5 rounded-lg text-white/80 backdrop-blur-sm border border-white/[0.06]">
                                        <Calendar size={13} className="text-brand-400" />
                                        {releaseFullDate}
                                    </span>
                                )}
                                {albumMeta?.primaryGenreName && (
                                    <span className="flex items-center gap-1.5 bg-brand-500/10 text-brand-300 px-3 py-1.5 rounded-lg backdrop-blur-sm border border-brand-500/15">
                                        <Tag size={13} />
                                        {albumMeta.primaryGenreName}
                                    </span>
                                )}
                                {!loading && (
                                    <span className="flex items-center gap-1.5 bg-white/[0.04] px-3 py-1.5 rounded-lg border border-white/[0.04]">
                                        <Music size={13} className="text-slate-500" />
                                        {itunesTracks.length} canci{itunesTracks.length !== 1 ? "ones" : "ón"}
                                    </span>
                                )}
                                {totalMins > 0 && (
                                    <span className="flex items-center gap-1.5 bg-white/[0.04] px-3 py-1.5 rounded-lg border border-white/[0.04]">
                                        <Clock size={13} className="text-slate-500" />
                                        {totalMins} min
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Action buttons */}
                    {!loading && itunesTracks.length > 0 && (
                        <div className="relative z-10 px-8 pb-6 flex items-center justify-center md:justify-start gap-4">
                            {notDownloadedCount > 0 ? (
                                <button
                                    onClick={handleDownloadAll}
                                    disabled={downloadingAll}
                                    className="bg-brand-500 hover:bg-brand-400 text-white px-8 py-3.5 rounded-full font-bold flex items-center gap-2 transition-all duration-300 hover:scale-105 active:scale-95 shadow-[0_8px_25px_rgba(99,102,241,0.4)] hover:shadow-[0_12px_30px_rgba(99,102,241,0.6)] disabled:opacity-40 disabled:hover:scale-100 disabled:hover:shadow-none min-w-[200px] outline-none focus-visible:ring-4 focus-visible:ring-brand-400/50"
                                >
                                    {downloadingAll ? (
                                        <>
                                            <Loader size={20} className="animate-spin" />
                                            {downloadProgress}%
                                        </>
                                    ) : (
                                        <>
                                            <DownloadCloud size={20} strokeWidth={2.5} />
                                            Descargar Disco
                                        </>
                                    )}
                                </button>
                            ) : (
                                <div className="bg-green-500/10 border border-green-500/20 text-green-400 px-6 py-3 rounded-full font-bold flex items-center gap-2 backdrop-blur-md">
                                    <Check size={20} strokeWidth={2.5} />
                                    Descargado en tu celular
                                </div>
                            )}
                        </div>
                    )}

                    {/* Download progress bar */}
                    {downloadingAll && (
                        <div className="relative z-10 px-6 pb-3">
                            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-brand-600 to-brand-400 rounded-full transition-all duration-300"
                                    style={{ width: `${downloadProgress}%` }}
                                />
                            </div>
                        </div>
                    )}

                    {/* Copyright */}
                    {albumMeta?.copyright && (
                        <div className="relative z-10 px-8 pb-4">
                            <p className="text-[11px] text-slate-500/70 font-medium truncate">
                                © {albumMeta.copyright}
                            </p>
                        </div>
                    )}
                </div>

                {/* Track list */}
                <div className="flex-1 overflow-y-auto px-2 py-2">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-3">
                            <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
                            <p className="text-slate-400 text-sm">Buscando canciones del álbum...</p>
                        </div>
                    ) : itunesTracks.length === 0 ? (
                        <div className="text-center py-16">
                            <Disc3 size={48} className="mx-auto text-slate-600 mb-4" />
                            <p className="text-slate-400 font-medium">No se encontraron canciones de este álbum</p>
                            <p className="text-slate-500 text-sm mt-1">Intenta buscar el álbum manualmente</p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-1.5 pb-6">
                            {itunesTracks.map((track, idx) => {
                                const strId = track.trackId.toString();
                                const isDownloaded = savedTrackIds.has(strId);
                                const isDownloading = downloadingId === strId || (downloadingAll && !savedTrackIds.has(strId));
                                const isLiked = likedMap[strId] || false;
                                const isCurrent = currentTrack?.id === `stream-${strId}` || currentTrack?.id === strId;
                                const progress = downloadProgresses[strId] || 0;

                                return (
                                    <div
                                        key={track.trackId}
                                        onClick={() => handlePlayTrack(track)}
                                        className={`group flex items-center gap-4 px-4 py-3 mx-2 rounded-2xl cursor-pointer transition-all duration-300 outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 ${isCurrent
                                            ? "bg-brand-500/10 shadow-[0_4px_20px_-5px_rgba(99,102,241,0.2)]"
                                            : "hover:bg-white/[0.06] hover:shadow-md"
                                            }`}
                                    >
                                        <div className="w-8 text-center flex-shrink-0 relative">
                                            {isCurrent && isLoading ? (
                                                <div className="w-full flex justify-center">
                                                    <Loader size={16} className="text-brand-400 animate-spin" strokeWidth={2.5} />
                                                </div>
                                            ) : isCurrent && isPlaying ? (
                                                <div className="w-full flex justify-center">
                                                    <Music size={16} className="text-brand-500 animate-[bounce_1s_infinite]" strokeWidth={2.5} />
                                                </div>
                                            ) : (
                                                <>
                                                    <span className={`text-[13px] font-bold group-hover:opacity-0 transition-opacity ${isCurrent ? "text-brand-400" : "text-slate-500"}`}>
                                                        {track.trackNumber || idx + 1}
                                                    </span>
                                                    <Play size={14} fill="currentColor" className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                                </>
                                            )}
                                        </div>

                                        <div className="relative w-11 h-11 flex-shrink-0">
                                            <img
                                                src={track.artworkUrl100}
                                                alt=""
                                                className={`w-full h-full rounded-[10px] object-cover shadow-[0_4px_10px_rgba(0,0,0,0.3)] transition-all duration-300 ${isCurrent ? "ring-2 ring-brand-500 ring-offset-2 ring-offset-[#060913]" : "group-hover:scale-105"}`}
                                            />
                                        </div>

                                        <div className="flex-1 min-w-0 pr-4">
                                            <p className={`text-[15px] font-bold truncate transition-colors drop-shadow-sm ${isCurrent ? "text-brand-400" : "text-white group-hover:text-brand-200"}`}>
                                                {track.trackName}
                                            </p>
                                            <p className="text-[13px] font-medium text-slate-400 truncate mt-0.5">{track.artistName}</p>
                                        </div>

                                        <span className="text-xs font-medium text-slate-500 flex-shrink-0 hidden sm:block mr-2">
                                            {track.trackTimeMillis ? formatDuration(track.trackTimeMillis) : ""}
                                        </span>

                                        {isDownloaded && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleToggleLike(e, strId); }}
                                                className={`p-2.5 rounded-full transition-all duration-300 flex-shrink-0 active:scale-90 focus-visible:ring-4 focus-visible:ring-pink-500/40 outline-none ${isLiked
                                                    ? "text-pink-500 bg-pink-500/10 hover:bg-pink-500/20"
                                                    : "text-slate-500 hover:text-pink-400 hover:bg-white/10 opacity-0 group-hover:opacity-100"
                                                    }`}
                                                aria-label={isLiked ? "Quitar me gusta" : "Me gusta"}
                                            >
                                                <Heart size={18} fill={isLiked ? "currentColor" : "none"} />
                                            </button>
                                        )}

                                        <button
                                            onClick={(e) => { e.stopPropagation(); if (!isDownloaded && !isDownloading) handleDownload(track); }}
                                            disabled={isDownloading || isDownloaded}
                                            className={`p-2.5 rounded-full transition-all duration-300 active:scale-90 flex-shrink-0 ml-1 outline-none focus-visible:ring-4 focus-visible:ring-brand-400/50 relative ${isDownloaded
                                                ? "text-green-500 opacity-60 cursor-default"
                                                : isDownloading
                                                    ? "text-brand-400"
                                                    : "text-slate-500 hover:text-brand-400 hover:bg-brand-500/10 opacity-0 group-hover:opacity-100 cursor-pointer"
                                                }`}
                                            title={isDownloaded ? "Ya descargado" : "Descargar"}
                                        >
                                            {isDownloading ? (
                                                <div className="relative w-5 h-5 flex items-center justify-center">
                                                    <svg className="w-[30px] h-[30px] -rotate-90 transform absolute" viewBox="0 0 36 36" style={{ top: -5, left: -5 }}>
                                                        <path className="text-white/20 stroke-current" strokeWidth="3" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                                                        <path className="text-white stroke-current transition-all duration-300" strokeWidth="3" strokeDasharray={`${progress}, 100`} fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                                                    </svg>
                                                    <span className="text-[7px] font-bold text-white leading-none">{progress > 0 ? `${progress}` : <div className="w-3 h-3 border-[1.5px] border-white/40 border-t-white rounded-full animate-spin" />}</span>
                                                </div>
                                            ) : isDownloaded ? (
                                                <Check size={18} strokeWidth={2.5} />
                                            ) : (
                                                <Download size={18} />
                                            )}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

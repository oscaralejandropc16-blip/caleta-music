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
    const [downloadingAll, setDownloadingAll] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState(0);
    const { playTrack, currentTrack, isPlaying } = usePlayer();

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
        const success = await downloadAndSaveTrack(track, null, strId);
        if (success) {
            setSavedTrackIds(prev => new Set(prev).add(strId));
        }
        setDownloadingId(null);
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />

            <div className="relative z-10 w-full max-w-2xl mx-4 max-h-[85vh] bg-[#0f1629] border border-white/[0.08] rounded-3xl shadow-2xl overflow-hidden animate-modal-in flex flex-col">
                {/* Header */}
                <div className="relative">
                    <div
                        className="absolute inset-0 opacity-30 blur-2xl scale-110"
                        style={{
                            backgroundImage: `url(${largeCover})`,
                            backgroundSize: "cover",
                            backgroundPosition: "center",
                        }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-[#0f1629]/60 to-[#0f1629]" />

                    <button
                        onClick={(e) => { e.stopPropagation(); onClose(); }}
                        className="absolute top-4 right-4 z-30 text-white/80 hover:text-white p-2.5 rounded-full bg-black/60 hover:bg-black/80 transition-all cursor-pointer"
                    >
                        <X size={20} />
                    </button>

                    <div className="relative z-10 flex items-end gap-5 px-6 pt-8 pb-4">
                        <div className="w-32 h-32 rounded-2xl overflow-hidden shadow-2xl flex-shrink-0 border border-white/10">
                            {largeCover ? (
                                <img src={largeCover} alt={albumName} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full bg-slate-800 flex items-center justify-center">
                                    <Disc3 size={48} className="text-slate-600" />
                                </div>
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            {/* Type badge */}
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-semibold text-brand-400 uppercase tracking-wider">
                                    {isSingle ? "Single" : "Álbum"}
                                </span>
                                {albumMeta?.contentAdvisoryRating === "Explicit" && (
                                    <span className="text-[10px] font-bold bg-white/10 text-slate-300 px-1.5 py-0.5 rounded">E</span>
                                )}
                            </div>
                            <h2 className="text-2xl font-extrabold text-white leading-tight mb-1 line-clamp-2">
                                {albumName || "Álbum desconocido"}
                            </h2>
                            <p className="text-slate-400 font-medium">{artistName}</p>

                            {/* Metadata row */}
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-slate-500">
                                {releaseYear && (
                                    <span className="flex items-center gap-1">
                                        <Calendar size={12} />
                                        {releaseYear}
                                    </span>
                                )}
                                {albumMeta?.primaryGenreName && (
                                    <span className="flex items-center gap-1">
                                        <Tag size={12} />
                                        {albumMeta.primaryGenreName}
                                    </span>
                                )}
                                {!loading && (
                                    <span className="flex items-center gap-1">
                                        <Music size={12} />
                                        {itunesTracks.length} cancion{itunesTracks.length !== 1 ? "es" : ""}
                                    </span>
                                )}
                                {totalMins > 0 && (
                                    <span className="flex items-center gap-1">
                                        <Clock size={12} />
                                        {totalMins} min
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Action buttons */}
                    {!loading && itunesTracks.length > 0 && (
                        <div className="relative z-10 px-6 pb-3 flex items-center gap-3 flex-wrap">
                            {notDownloadedCount > 0 && (
                                <button
                                    onClick={handleDownloadAll}
                                    disabled={downloadingAll}
                                    className="bg-brand-500 hover:bg-brand-600 text-white px-5 py-2.5 rounded-full font-bold text-sm flex items-center gap-2 transition-all hover:scale-105 shadow-lg shadow-brand-500/20 disabled:opacity-60 disabled:hover:scale-100"
                                >
                                    {downloadingAll ? (
                                        <>
                                            <Loader size={16} className="animate-spin" />
                                            Descargando... {downloadProgress}%
                                        </>
                                    ) : (
                                        <>
                                            <DownloadCloud size={16} />
                                            Descargar Todo ({notDownloadedCount})
                                        </>
                                    )}
                                </button>
                            )}
                            {notDownloadedCount === 0 && (
                                <div className="flex items-center gap-2 text-green-400 text-sm font-medium bg-green-500/10 px-4 py-2 rounded-full">
                                    <Check size={16} />
                                    Álbum completo descargado
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

                    {/* Album info pills */}
                    {albumMeta && (
                        <div className="relative z-10 px-6 pb-4">
                            <div className="flex flex-wrap gap-2">
                                {releaseFullDate && (
                                    <span className="text-[11px] bg-white/[0.05] border border-white/[0.06] rounded-full px-3 py-1 text-slate-400">
                                        📅 Lanzado: {releaseFullDate}
                                    </span>
                                )}
                                {albumMeta.primaryGenreName && (
                                    <span className="text-[11px] bg-white/[0.05] border border-white/[0.06] rounded-full px-3 py-1 text-slate-400">
                                        🎵 Género: {albumMeta.primaryGenreName}
                                    </span>
                                )}
                                {isSingle && (
                                    <span className="text-[11px] bg-yellow-500/10 border border-yellow-500/20 rounded-full px-3 py-1 text-yellow-400">
                                        ⭐ Single
                                    </span>
                                )}
                                {albumMeta.copyright && (
                                    <span className="text-[11px] bg-white/[0.05] border border-white/[0.06] rounded-full px-3 py-1 text-slate-500 max-w-full truncate">
                                        © {albumMeta.copyright}
                                    </span>
                                )}
                            </div>
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
                        itunesTracks.map((track, idx) => {
                            const strId = track.trackId.toString();
                            const isDownloaded = savedTrackIds.has(strId);
                            const isDownloading = downloadingId === strId;
                            const isLiked = likedMap[strId] || false;
                            const isCurrent = currentTrack?.id === strId;

                            return (
                                <div
                                    key={track.trackId}
                                    className={`group flex items-center gap-3 px-4 py-3 mx-2 rounded-xl cursor-pointer transition-all ${isCurrent
                                            ? "bg-brand-500/10 border border-brand-500/20"
                                            : "hover:bg-white/[0.04]"
                                        }`}
                                >
                                    <div className="w-6 text-center text-sm font-medium text-slate-500 flex-shrink-0">
                                        {track.trackNumber || idx + 1}
                                    </div>

                                    <img
                                        src={track.artworkUrl100}
                                        alt=""
                                        className="w-10 h-10 rounded-lg object-cover flex-shrink-0 shadow"
                                    />

                                    <div className="flex-1 min-w-0">
                                        <p className={`font-semibold text-sm truncate ${isCurrent ? "text-brand-400" : "text-white"}`}>
                                            {track.trackName}
                                        </p>
                                        <p className="text-xs text-slate-400 truncate">{track.artistName}</p>
                                    </div>

                                    <span className="text-xs text-slate-500 flex-shrink-0 hidden sm:block">
                                        {track.trackTimeMillis ? formatDuration(track.trackTimeMillis) : ""}
                                    </span>

                                    {isDownloaded && (
                                        <button
                                            onClick={(e) => handleToggleLike(e, strId)}
                                            className={`p-1.5 rounded-full transition-all flex-shrink-0 ${isLiked
                                                    ? "text-pink-500"
                                                    : "text-slate-600 opacity-0 group-hover:opacity-100 hover:text-pink-500"
                                                }`}
                                        >
                                            <Heart size={15} fill={isLiked ? "currentColor" : "none"} />
                                        </button>
                                    )}

                                    <button
                                        onClick={() => { if (!isDownloaded && !isDownloading) handleDownload(track); }}
                                        disabled={isDownloading || isDownloaded}
                                        className={`p-2 rounded-full transition-all flex-shrink-0 ${isDownloaded
                                                ? "text-green-500 bg-green-500/10"
                                                : isDownloading
                                                    ? "text-brand-400"
                                                    : "text-slate-400 hover:text-brand-400 hover:bg-brand-500/10 opacity-0 group-hover:opacity-100"
                                            }`}
                                        title={isDownloaded ? "Ya descargado" : "Descargar"}
                                    >
                                        {isDownloading ? (
                                            <Loader size={16} className="animate-spin" />
                                        ) : isDownloaded ? (
                                            <Check size={16} />
                                        ) : (
                                            <Download size={16} />
                                        )}
                                    </button>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}

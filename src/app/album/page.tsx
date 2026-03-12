"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ArrowLeft, Play, Heart, Music, Download, Check, Disc3, Loader, DownloadCloud, Calendar, Tag, Clock } from "lucide-react";
import { getAllTracksFromDB, isTrackLiked, toggleLike, saveAlbum, removeAlbum, isAlbumSaved } from "@/lib/db";
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

export default function AlbumPage() {
    const searchParams = useSearchParams();
    const router = useRouter();

    const albumName = searchParams.get("name") || "";
    const artistName = searchParams.get("artist") || "";
    const coverUrl = searchParams.get("coverUrl") || "";

    const [itunesTracks, setItunesTracks] = useState<ItunesTrack[]>([]);
    const [albumMeta, setAlbumMeta] = useState<AlbumMeta | null>(null);
    const [savedTrackIds, setSavedTrackIds] = useState<Set<string>>(new Set());
    const [likedMap, setLikedMap] = useState<Record<string, boolean>>({});
    const [loading, setLoading] = useState(true);
    const [downloadingId, setDownloadingId] = useState<string | null>(null);
    const [downloadProgresses, setDownloadProgresses] = useState<Record<string, number>>({});
    const [downloadingAll, setDownloadingAll] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [isAlbumSavedState, setIsAlbumSavedState] = useState(false);
    const [collectionId, setCollectionId] = useState<string | null>(null);


    const { playTrack, currentTrack, isPlaying, isLoading } = usePlayer();

    useEffect(() => {
        if (!albumName) return;

        const loadAlbum = async () => {
            setLoading(true);
            setItunesTracks([]);
            setAlbumMeta(null);
            try {
                // Step 1: Search for the album to get collectionId (via Deezer)
                const searchRes = await fetch(
                    `/api/deezer-proxy?endpoint=${encodeURIComponent(`/search/album?q=${albumName + " " + artistName}&limit=10`)}`
                );
                const searchData = await searchRes.json();

                const albums = searchData.data || [];
                const targetAlbumStr = albumName.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace('single', '').trim();
                const targetArtistStr = artistName.toLowerCase().replace(/[^a-z0-9]/g, '');

                // Helper to check if artist name partially matches
                const isArtistMatch = (a: any) => {
                    if (!a.artist || !a.artist.name) return false;
                    const apiArtistStr = a.artist.name.toLowerCase().replace(/[^a-z0-9]/g, '');
                    return apiArtistStr.includes(targetArtistStr) || targetArtistStr.includes(apiArtistStr);
                };

                // Helper to check if album name partially matches
                const isAlbumMatch = (a: any) => {
                    if (!a.title) return false;
                    const apiAlbumStr = a.title.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace('single', '').trim();
                    return apiAlbumStr.includes(targetAlbumStr) || targetAlbumStr.includes(apiAlbumStr);
                };

                let matchedAlbum = albums.find((a: any) => isAlbumMatch(a) && isArtistMatch(a));

                if (!matchedAlbum) {
                    matchedAlbum = albums.find((a: any) => isAlbumMatch(a) || isArtistMatch(a)) || albums[0];
                }

                if (matchedAlbum && matchedAlbum.id) {
                    // Step 2: Extract ALL tracks via Deezer Album API
                    const albumRes = await fetch(`/api/deezer-proxy?endpoint=${encodeURIComponent(`/album/${matchedAlbum.id}`)}`);
                    const albumData = await albumRes.json();

                    setAlbumMeta({
                        releaseDate: albumData.release_date || "",
                        primaryGenreName: (albumData.genres?.data && albumData.genres.data.length > 0) ? albumData.genres.data[0].name : "Music",
                        copyright: albumData.label || "",
                        trackCount: albumData.nb_tracks || 0,
                        collectionType: albumData.record_type || "Album",
                        contentAdvisoryRating: albumData.explicit_lyrics ? "Explicit" : "",
                        collectionPrice: 0,
                        currency: "USD",
                        country: "US",
                    });

                    // Remaining results are the tracks mapped to ItunesTrack
                    const tracks: ItunesTrack[] = (albumData.tracks?.data || []).map((t: any) => ({
                        wrapperType: "track",
                        kind: "song",
                        artistId: t.artist.id,
                        collectionId: albumData.id,
                        trackId: t.id,
                        artistName: t.artist.name,
                        collectionName: albumData.title,
                        trackName: t.title,
                        previewUrl: t.preview,
                        artworkUrl30: albumData.cover_small,
                        artworkUrl60: albumData.cover_small,
                        artworkUrl100: albumData.cover_medium,
                        releaseDate: albumData.release_date || "",
                        trackTimeMillis: parseInt(t.duration || "0") * 1000,
                        primaryGenreName: "Música",
                        isStreamable: true,
                        _source: "deezer"
                    }));

                    setItunesTracks(tracks);
                    setCollectionId(albumData.id.toString());
                    const saved = await isAlbumSaved(albumData.id.toString());
                    setIsAlbumSavedState(saved);
                } else {
                    setItunesTracks([]);
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
    }, [albumName, artistName]);

    const handleToggleLike = async (e: React.MouseEvent, trackId: string) => {
        e.stopPropagation();
        const newState = await toggleLike(trackId);
        setLikedMap(prev => ({ ...prev, [trackId]: newState }));
    };

    const handleToggleSaveAlbum = async () => {
        if (!collectionId || !albumName) return;
        if (isAlbumSavedState) {
            await removeAlbum(collectionId);
            setIsAlbumSavedState(false);
        } else {
            await saveAlbum({
                id: collectionId,
                name: albumName,
                artist: artistName,
                coverUrl: coverUrl,
                trackCount: itunesTracks.length,
                savedAt: Date.now()
            });
            setIsAlbumSavedState(true);
        }
    };


    const handleDownload = async (track: ItunesTrack) => {
        const strId = track.trackId.toString();
        setDownloadingId(strId);
        const result = await downloadAndSaveTrack(track, null, strId, (progress) => {
            setDownloadProgresses(prev => ({ ...prev, [strId]: progress }));
        });
        if (result.success) {
            setSavedTrackIds(prev => new Set(prev).add(strId));
        } else {
            console.warn(`[Album] Download failed: ${result.error}`);
        }
        setDownloadingId(null);
    };

    const toSavedTrack = (t: ItunesTrack) => ({
        id: `stream-${t.trackId}`,
        title: t.trackName,
        artist: t.artistName,
        album: t.collectionName || "",
        coverUrl: t.artworkUrl100?.replace("100x100", "500x500") || "",
        streamUrl: `/api/deezer?title=${encodeURIComponent(t.trackName)}&artist=${encodeURIComponent(t.artistName)}`,
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
            const result = await downloadAndSaveTrack(track, null, strId);
            if (result.success) {
                setSavedTrackIds(prev => new Set(prev).add(strId));
            }
            setDownloadProgress(Math.round(((i + 1) / tracksToDownload.length) * 100));
        }

        if (collectionId && !isAlbumSavedState) {
            await saveAlbum({
                id: collectionId,
                name: albumName,
                artist: artistName,
                coverUrl: coverUrl,
                trackCount: itunesTracks.length,
                savedAt: Date.now()
            });
            setIsAlbumSavedState(true);
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
    const releaseFullDate = albumMeta?.releaseDate
        ? new Date(albumMeta.releaseDate).toLocaleDateString("es", { year: "numeric", month: "long", day: "numeric" })
        : null;

    const isSingle = albumMeta?.collectionType === "Single" || albumName.toLowerCase().includes("single");
    const notDownloadedCount = itunesTracks.filter(t => !savedTrackIds.has(t.trackId.toString())).length;

    return (
        <main className="min-h-screen bg-[#060913] pb-32 overflow-x-hidden relative">
            {/* Header / Cover background */}
            <div className="relative">
                <div
                    className="absolute inset-0 opacity-40 blur-[50px] scale-125 transform-gpu saturate-150"
                    style={{
                        backgroundImage: `url(${largeCover})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                    }}
                />

                {/* Gradient overlay for blending */}
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#060913]/60 to-[#060913]" />

                {/* Navbar/Back button */}
                <div className="relative z-20 pt-safe pt-5 md:pt-8 px-4 md:px-8 flex items-center mb-4 max-w-5xl mx-auto">
                    <button
                        onClick={() => router.back()}
                        className="bg-black/30 backdrop-blur-md p-2.5 rounded-full hover:bg-black/50 transition-colors"
                    >
                        <ArrowLeft className="text-white" size={24} />
                    </button>
                </div>

                {/* Details Section */}
                <div className="relative z-10 flex flex-col md:flex-row items-center md:items-end gap-6 px-4 md:px-8 pb-6 max-w-5xl mx-auto">
                    <div className="w-56 h-56 md:w-60 md:h-60 rounded-xl overflow-hidden shadow-[0_15px_40px_rgba(0,0,0,0.5)] flex-shrink-0 bg-slate-800">
                        {largeCover ? (
                            <img src={largeCover} alt={albumName} className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center">
                                <Disc3 size={60} className="text-slate-600 drop-shadow-lg" />
                            </div>
                        )}
                    </div>

                    <div className="flex-1 min-w-0 text-center md:text-left flex flex-col items-center md:items-start w-full">
                        {/* Type badge */}
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs text-brand-400 font-bold uppercase tracking-[0.2em]">{isSingle ? "Single" : "Álbum"}</span>
                            {albumMeta?.contentAdvisoryRating === "Explicit" && (
                                <span className="text-[9px] font-black bg-white/15 backdrop-blur-md text-white px-1.5 py-0.5 rounded-sm border border-white/10 shadow-sm" title="Explicit">E</span>
                            )}
                        </div>

                        <h1 className="text-3xl md:text-4xl lg:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-200 leading-tight mb-2 drop-shadow-lg pb-1">
                            {albumName || "Álbum desconocido"}
                        </h1>

                        <p className="text-lg md:text-xl text-slate-300 font-bold drop-shadow-md mb-4">{artistName}</p>

                        {/* Metadata row */}
                        <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-2 gap-y-2 text-[12px] font-semibold text-slate-400">
                            {releaseFullDate && (
                                <span className="flex items-center gap-1.5 opacity-80">
                                    <Calendar size={13} />{releaseFullDate}
                                </span>
                            )}
                            <span className="text-slate-600 hidden md:inline">•</span>
                            {!loading && (
                                <span className="flex items-center gap-1.5">
                                    <Music size={13} /> {itunesTracks.length} cancion{itunesTracks.length !== 1 ? "es" : ""}
                                </span>
                            )}
                            <span className="text-slate-600 hidden md:inline">•</span>
                            {totalMins > 0 && (
                                <span className="flex items-center gap-1.5">
                                    <Clock size={13} /> {totalMins} min
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Actions Row */}
                {!loading && itunesTracks.length > 0 && (
                    <div className="relative z-10 px-4 md:px-8 pb-6 pt-2 flex items-center justify-center md:justify-start gap-4 max-w-5xl mx-auto w-full">
                        {/* Download All Button */}
                        {notDownloadedCount > 0 ? (
                            <button
                                onClick={handleDownloadAll}
                                disabled={downloadingAll}
                                className="bg-brand-500 hover:bg-brand-400 text-white px-8 py-3.5 rounded-full font-bold flex items-center gap-2 transition-all duration-300 hover:scale-105 active:scale-95 shadow-[0_8px_25px_rgba(99,102,241,0.4)] disabled:opacity-50 min-w-[180px] justify-center"
                            >
                                {downloadingAll ? (
                                    <>
                                        <Loader size={20} className="animate-spin" />
                                        {downloadProgress}%
                                    </>
                                ) : (
                                    <>
                                        <DownloadCloud size={20} strokeWidth={2.5} /> Descargar
                                    </>
                                )}
                            </button>
                        ) : (
                            <div className="bg-green-500/10 border border-green-500/20 text-green-400 px-6 py-3 rounded-full font-bold flex items-center gap-2">
                                <Check size={20} strokeWidth={2.5} /> Guardado
                            </div>
                        )}

                        {/* Floating play button next to download */}
                        <button
                            onClick={() => handlePlayTrack(itunesTracks[0])}
                            className="bg-green-500 hover:bg-green-400 text-black p-4 rounded-full shadow-lg hover:scale-105 active:scale-95 transition-all outline-none focus-visible:ring-4 focus-visible:ring-green-400/50"
                        >
                            <Play size={24} fill="currentColor" className="ml-1" />
                        </button>

                        <button
                            onClick={handleToggleSaveAlbum}
                            className={`p-4 rounded-full transition-all duration-300 active:scale-90 flex-shrink-0 flex items-center justify-center border ${isAlbumSavedState
                                ? "bg-pink-500/10 text-pink-500 border-pink-500/30 shadow-[0_0_15px_rgba(236,72,153,0.2)]"
                                : "bg-white/5 text-white/60 border-white/10 hover:bg-white/10 hover:text-white"
                                }`}
                            title={isAlbumSavedState ? "Quitar de la biblioteca" : "Guardar en la biblioteca"}
                        >
                            <Heart size={24} fill={isAlbumSavedState ? "currentColor" : "none"} />
                        </button>
                    </div>
                )}

            </div>

            {/* Tracklist */}
            <div className="px-2 md:px-4 max-w-5xl mx-auto mt-4">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-3">
                        <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                ) : itunesTracks.length === 0 ? (
                    <div className="text-center py-20 opacity-60">
                        <Disc3 size={48} className="mx-auto mb-4" />
                        <p>No se encontraron pistas</p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-1">
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
                                    className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${isCurrent ? "bg-white/10" : "hover:bg-white/5"
                                        }`}
                                >
                                    <div className="w-8 text-center text-slate-400 font-medium">
                                        {isCurrent && isLoading ? (
                                            <Loader size={16} className="mx-auto animate-spin text-brand-400" />
                                        ) : isCurrent && isPlaying ? (
                                            <Music size={16} className="mx-auto text-brand-400 animate-pulse" />
                                        ) : (
                                            <span className="text-[14px]">{idx + 1}</span>
                                        )}
                                    </div>

                                    <div className="flex-1 min-w-0 pr-4">
                                        <p className={`text-[15px] truncate font-semibold ${isCurrent ? "text-brand-400" : "text-white"}`}>
                                            {track.trackName}
                                        </p>
                                        <p className="text-[13px] text-slate-400 truncate">{track.artistName}</p>
                                    </div>

                                    {/* Action Buttons */}
                                    {isDownloaded && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleToggleLike(e, strId); }}
                                            className={`p-2 rounded-full transition-colors hidden sm:block ${isLiked ? "text-pink-500" : "text-slate-500 opacity-0 group-hover:opacity-100 hover:text-white"
                                                }`}
                                        >
                                            <Heart size={18} fill={isLiked ? "currentColor" : "none"} />
                                        </button>
                                    )}

                                    <button
                                        onClick={(e) => { e.stopPropagation(); if (!isDownloaded && !isDownloading) handleDownload(track); }}
                                        disabled={isDownloading || isDownloaded}
                                        className={`p-2 rounded-full transition-colors ${isDownloaded ? "text-green-500" : isDownloading ? "text-brand-400" : "text-slate-500 hover:text-white"
                                            }`}
                                    >
                                        {isDownloading ? (
                                            <Loader size={18} className="animate-spin" />
                                        ) : isDownloaded ? (
                                            <Check size={18} />
                                        ) : (
                                            <Download size={18} />
                                        )}
                                    </button>

                                    <span className="text-xs text-slate-400 w-10 text-right tabular-nums hidden sm:block">
                                        {formatDuration(track.trackTimeMillis || 0)}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Copyright */}
            {albumMeta?.copyright && (
                <div className="text-center pb-8 pt-8 px-4 opacity-40">
                    <p className="text-[11px] font-medium">
                        © {albumMeta.copyright}
                    </p>
                </div>
            )}
        </main>
    );
}

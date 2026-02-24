"use client";

import { useEffect, useState } from "react";
import { Play, Download, Check, Heart, MoreHorizontal, ChevronLeft, Disc3, Shuffle, ArrowLeft } from "lucide-react";
import { ItunesTrack, downloadAndSaveTrack } from "@/lib/download";
import { usePlayer } from "@/context/PlayerContext";
import { SavedTrack, getAllTracksFromDB, toggleLike, getAllLikedTrackIds } from "@/lib/db";
import { useParams, useRouter } from "next/navigation";
import AlbumDetailModal from "@/components/AlbumDetailModal";

interface AlbumGroup {
    name: string;
    artist: string;
    cover: string;
    trackCount: number;
    year: string;
}

export default function ArtistProfile() {
    const params = useParams();
    const router = useRouter();
    const artistName = decodeURIComponent((params.name as string) || "");

    const [tracks, setTracks] = useState<ItunesTrack[]>([]);
    const [albums, setAlbums] = useState<AlbumGroup[]>([]);
    const [loading, setLoading] = useState(true);
    const [savedTrackIds, setSavedTrackIds] = useState<Set<string>>(new Set());
    const [localTracksMap, setLocalTracksMap] = useState<Map<string, SavedTrack>>(new Map());
    const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
    const [downloadingId, setDownloadingId] = useState<string | null>(null);
    const [downloadProgresses, setDownloadProgresses] = useState<Record<string, number>>({});

    const [albumModal, setAlbumModal] = useState({ open: false, album: "", artist: "", cover: "" });

    const { playTrack } = usePlayer();

    useEffect(() => {
        if (!artistName) return;

        getAllLikedTrackIds().then(ids => setLikedIds(new Set(ids)));

        // Fetch artist top tracks combining local db and iTunes
        const fetchArtistData = async () => {
            setLoading(true);
            try {
                // DB Data
                const dbTracks = await getAllTracksFromDB();
                setSavedTrackIds(new Set(dbTracks.map((t) => t.id)));
                const localMap = new Map<string, SavedTrack>();
                dbTracks.forEach(t => localMap.set(t.id, t));
                setLocalTracksMap(localMap);

                // Fetch top songs from iTunes
                let results: ItunesTrack[] = [];
                try {
                    const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(artistName)}&entity=song&limit=50`);
                    const data = await res.json();
                    results = data.results || [];
                } catch (e) { console.error("iTunes fetch failed"); }

                // Filter only tracks where artist matches roughly
                const iTunesArtistTracks = results.filter(t => t.artistName.toLowerCase().includes(artistName.toLowerCase()));

                const localArtistTracks = dbTracks.filter((t) =>
                    t.artist.toLowerCase().includes(artistName.toLowerCase())
                ).map(t => ({
                    trackId: t.id as unknown as number,
                    artistName: t.artist,
                    trackName: t.title,
                    collectionName: t.album || "",
                    artworkUrl100: t.coverUrl || "",
                    previewUrl: t.streamUrl || "",
                }));

                // Combine local and iTunes (avoiding duplicates by name)
                const combinedMap = new Map<string, ItunesTrack>();
                localArtistTracks.forEach(t => combinedMap.set(t.trackName.toLowerCase(), t));
                iTunesArtistTracks.forEach(t => {
                    if (!combinedMap.has(t.trackName.toLowerCase())) {
                        combinedMap.set(t.trackName.toLowerCase(), t);
                    }
                });

                const finalTracks = Array.from(combinedMap.values());
                setTracks(finalTracks.slice(0, 15)); // Top 15 tracks

                // Extract albums
                const albumMap = new Map<string, AlbumGroup>();
                finalTracks.forEach(track => {
                    if (track.collectionName) {
                        const key = track.collectionName;
                        if (!albumMap.has(key)) {
                            let year = "";
                            if (track.releaseDate) year = new Date(track.releaseDate).getFullYear().toString();

                            albumMap.set(key, {
                                name: track.collectionName,
                                artist: track.artistName,
                                cover: track.artworkUrl100,
                                trackCount: 1,
                                year
                            });
                        } else {
                            albumMap.get(key)!.trackCount++;
                        }
                    }
                });

                // Convert to array and sort by track count
                const albumsArray = Array.from(albumMap.values()).sort((a, b) => b.trackCount - a.trackCount);
                setAlbums(albumsArray);

            } catch (error) {
                console.error("Error fetching artist data", error);
            } finally {
                setLoading(false);
            }
        };

        fetchArtistData();
    }, [artistName]);

    const handlePlay = (track: ItunesTrack) => {
        const strId = track.trackId.toString();

        if (localTracksMap.has(strId)) {
            playTrack(localTracksMap.get(strId)!);
            return;
        }

        const downloadUrl = `/api/download?title=${encodeURIComponent(track.trackName)}&artist=${encodeURIComponent(track.artistName)}&stream=true`;

        playTrack({
            id: `stream-${strId}`,
            title: track.trackName,
            artist: track.artistName,
            album: track.collectionName || "",
            coverUrl: track.artworkUrl100?.replace("100x100", "500x500") || "",
            streamUrl: downloadUrl,
            downloadedAt: Date.now(),
        });
    };

    const handleDownload = async (track: ItunesTrack) => {
        const strId = track.trackId.toString();
        setDownloadingId(strId);
        const success = await downloadAndSaveTrack(track, null, strId, (progress) => {
            setDownloadProgresses(prev => ({ ...prev, [strId]: progress }));
        });
        if (success) setSavedTrackIds((prev) => new Set(prev).add(strId));
        setDownloadingId(null);
    };

    const handleToggleLike = async (e: React.MouseEvent, trackId: string) => {
        e.stopPropagation();
        if (!savedTrackIds.has(trackId)) return;
        const nowLiked = await toggleLike(trackId);
        setLikedIds(prev => { const next = new Set(prev); if (nowLiked) next.add(trackId); else next.delete(trackId); return next; });
    };

    const headerImage = tracks.length > 0 ? tracks[0].artworkUrl100.replace("100x100", "1000x1000") : "";

    return (
        <main className="w-full pb-24 md:pb-8 min-h-screen bg-[#0a0f1e] text-white">
            {loading ? (
                <div className="flex flex-col items-center justify-center p-20 gap-4 min-h-screen">
                    <div className="w-12 h-12 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-slate-500 text-sm animate-pulse">Cargando perfil...</p>
                </div>
            ) : (
                <>
                    {/* Header Image */}
                    <div className="relative w-full h-[400px] md:h-[500px]">
                        <div
                            className="absolute inset-0 bg-cover bg-center"
                            style={{ backgroundImage: `url(${headerImage})` }}
                        >
                            {/* Gradient Overlay */}
                            <div className="absolute inset-0 bg-gradient-to-t from-[#0a0f1e] via-[#0a0f1e]/60 to-transparent"></div>
                        </div>

                        {/* Top Bar Navigation */}
                        <div className="absolute top-0 left-0 right-0 p-4 md:p-8 flex items-center justify-between z-20">
                            <button
                                onClick={() => router.back()}
                                className="w-10 h-10 bg-black/30 backdrop-blur-md rounded-full flex items-center justify-center text-white hover:bg-black/50 transition-colors shadow-[0_4px_15px_rgba(0,0,0,0.5)] border border-white/10"
                            >
                                <ArrowLeft size={24} />
                            </button>
                        </div>

                        {/* Artist Info */}
                        <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10 z-20 flex flex-col justify-end gap-6 max-w-[1400px] mx-auto">
                            <div>
                                <h1 className="text-5xl md:text-8xl font-black text-white drop-shadow-lg tracking-tight mb-2">
                                    {artistName}
                                </h1>
                                <p className="text-slate-300 font-medium">1,000,000+ Oyentes mensuales</p>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex items-center gap-4 mt-2">
                                <button className="w-16 h-16 bg-brand-500 hover:bg-brand-400 text-white rounded-full flex items-center justify-center shadow-[0_10px_30px_rgba(99,102,241,0.5)] transition-transform active:scale-95 border-2 border-brand-400/50">
                                    <Play size={32} fill="currentColor" className="ml-1.5" />
                                </button>
                                <button className="w-12 h-12 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 text-white rounded-full flex items-center justify-center transition-colors">
                                    <Shuffle size={20} />
                                </button>
                                <button className="w-10 h-10 text-white/70 hover:text-white rounded-full flex items-center justify-center transition-colors">
                                    <MoreHorizontal size={24} />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="max-w-[1400px] mx-auto px-4 md:px-10 mt-8">
                        {/* Top Tracks */}
                        <section className="mb-14">
                            <h2 className="text-2xl font-bold text-white mb-6 tracking-tight">Canciones top</h2>
                            <div className="flex flex-col gap-2">
                                {tracks.map((track, idx) => {
                                    const strId = track.trackId.toString();
                                    const isDownloaded = savedTrackIds.has(strId);
                                    const isDownloading = downloadingId === strId;
                                    const isLiked = likedIds.has(strId);
                                    const progress = downloadProgresses[strId] || 0;

                                    return (
                                        <div
                                            key={strId}
                                            className="group flex items-center gap-4 p-3 rounded-2xl hover:bg-white/5 transition-all cursor-pointer border border-transparent hover:border-white/10"
                                            onClick={() => handlePlay(track)}
                                        >
                                            <div className="w-8 text-center text-slate-400 font-medium text-lg relative">
                                                <span className="group-hover:opacity-0">{idx + 1}</span>
                                                <Play size={16} fill="currentColor" className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                            </div>
                                            <div className="w-14 h-14 rounded-xl overflow-hidden shadow-lg flex-shrink-0 bg-slate-800">
                                                <img src={track.artworkUrl100.replace("100x100", "200x200")} alt={track.trackName} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                            </div>
                                            <div className="flex-1 min-w-0 pr-4">
                                                <h3 className="text-white font-bold text-base truncate drop-shadow-sm">{track.trackName}</h3>
                                                <p className="text-slate-400 font-medium text-sm truncate">{track.artistName}</p>
                                            </div>

                                            {/* Track Actions */}
                                            <div className="flex items-center gap-3 pr-2">
                                                {isDownloaded ? (
                                                    <button onClick={(e) => handleToggleLike(e, strId)} className={`p-2 transition-all active:scale-90 ${isLiked ? "text-pink-500 group-hover:scale-110 drop-shadow-[0_0_8px_rgba(236,72,153,0.5)]" : "text-white/40 hover:text-white"}`}>
                                                        <Heart size={20} fill={isLiked ? "currentColor" : "none"} />
                                                    </button>
                                                ) : (
                                                    <button onClick={(e) => { e.stopPropagation(); handleDownload(track); }} disabled={isDownloading} className="p-2 text-white/40 hover:text-white transition-all active:scale-90 relative">
                                                        {isDownloading ? (
                                                            <div className="relative w-5 h-5 flex items-center justify-center">
                                                                <svg className="w-[30px] h-[30px] -rotate-90 transform absolute" viewBox="0 0 36 36" style={{ top: -5, left: -5 }}>
                                                                    <path className="text-white/20 stroke-current" strokeWidth="3" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                                                                    <path className="text-white stroke-current transition-all duration-300" strokeWidth="3" strokeDasharray={`${progress}, 100`} fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                                                                </svg>
                                                                <span className="text-[7px] font-bold text-white leading-none">{progress > 0 ? `${progress}` : <div className="w-3 h-3 border-[1.5px] border-white/40 border-t-white rounded-full animate-spin" />}</span>
                                                            </div>
                                                        ) : <Download size={20} />}
                                                    </button>
                                                )}
                                                <button className="p-2 text-white/40 hover:text-white transition-colors" onClick={(e) => e.stopPropagation()}>
                                                    <MoreHorizontal size={20} />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>

                        {/* Discography */}
                        {albums.length > 0 && (
                            <section className="mb-16">
                                <h2 className="text-2xl font-bold text-white mb-6 tracking-tight">Discografía</h2>
                                <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide snap-x">
                                    {albums.map((album, idx) => {
                                        const cover = album.cover.replace("100x100", "400x400");
                                        return (
                                            <button
                                                key={idx}
                                                onClick={() => setAlbumModal({ open: true, album: album.name, artist: album.artist, cover: album.cover })}
                                                className="text-left group flex-shrink-0 snap-center min-w-[160px] w-[160px] md:min-w-[200px] md:w-[200px]"
                                            >
                                                <div className="w-full aspect-square rounded-[1.5rem] overflow-hidden mb-4 bg-slate-800 shadow-[0_15px_30px_rgba(0,0,0,0.3)] border border-white/5 relative">
                                                    <img src={cover} alt={album.name} className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-700 ease-out" />
                                                </div>
                                                <h3 className="text-white font-bold text-sm md:text-base truncate leading-tight group-hover:text-brand-400 transition-colors drop-shadow-sm">{album.name}</h3>
                                                <p className="text-slate-400 font-medium text-xs md:text-sm mt-1 mx-0.5 truncate tracking-wide">Álbum{album.year ? ` • ${album.year}` : ""}</p>
                                            </button>
                                        );
                                    })}
                                </div>
                            </section>
                        )}
                    </div>
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

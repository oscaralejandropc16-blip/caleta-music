"use client";

import { useEffect, useState, Suspense } from "react";
import {
    Play,
    Search,
    Library as LibraryIcon,
    Trash2,
    Heart,
    Plus,
    ListMusic,
    Music,
    Disc3,
    MoreHorizontal,
    CloudDownload,
    Cloud,
    Loader
} from "lucide-react";
import {
    getAllTracksFromDB,
    removeTrackFromDB,
    SavedTrack,
    getAllPlaylists,
    createPlaylist,
    addTrackToPlaylist,
    Playlist,
    getAllLikedTrackIds,
    toggleLike,
    getAllSavedAlbums,
    SavedAlbum,
} from "@/lib/db";
import { downloadAndSaveTrack } from "@/lib/download";
import { getUserLibrary, removeSongFromLibrary, syncPlaylistToCloud, pullPlaylistsFromCloud, removePlaylistFromCloud } from "@/lib/syncLibrary";
import { usePlayer } from "@/context/PlayerContext";
import { useSearchParams, useRouter } from "next/navigation";
import CreatePlaylistModal from "@/components/CreatePlaylistModal";
import PlaylistDetailModal from "@/components/PlaylistDetailModal";
import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';
import { useDownloadSong } from "@/hooks/useDownloadSong";
import { useAuth } from "@/context/AuthContext";

function LibraryContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const tab = searchParams.get("tab");
    const playlistIdParam = searchParams.get("playlist");
    const { user } = useAuth();

    const [tracks, setTracks] = useState<SavedTrack[]>([]);
    const [cloudTracks, setCloudTracks] = useState<SavedTrack[]>([]);
    const [downloadingCloudIds, setDownloadingCloudIds] = useState<Set<string>>(new Set());
    const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});
    const [playlists, setPlaylists] = useState<Playlist[]>([]);
    const [query, setQuery] = useState("");
    const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
    const [activeTab, setActiveTab] = useState<"all" | "likes" | "playlists" | "albums">(
        tab === "likes" ? "likes" : tab === "playlists" ? "playlists" : tab === "albums" ? "albums" : "all"
    );
    const [savedAlbums, setSavedAlbums] = useState<SavedAlbum[]>([]);

    const [showCreateModal, setShowCreateModal] = useState(false);
    const [contextMenuTrackId, setContextMenuTrackId] = useState<string | null>(null);
    const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

    // Native Capacitor download hook
    const { downloadSong, downloadingIds, downloadProgress: nativeDownloadProgress } = useDownloadSong();

    // Playlist detail modal state
    const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);

    const { playTrack, currentTrack, isPlaying } = usePlayer();

    const loadLibrary = async () => {
        let downloaded: SavedTrack[] = [];

        // 1. Leer de IndexedDB (localforage) — funciona en web y nativo
        try {
            const indexedDbTracks = await getAllTracksFromDB();
            downloaded = [...indexedDbTracks];
        } catch (error) {
            console.error("Error al cargar descargas de IndexedDB:", error);
        }

        // 2. Leer de Capacitor Preferences (para descargas nativas)
        try {
            const { value } = await Preferences.get({ key: 'caleta_downloaded_tracks' });
            if (value) {
                const parsed = JSON.parse(value);
                const existingIds = new Set(downloaded.map(t => t.id));
                parsed.forEach((t: any) => {
                    if (!existingIds.has(t.id)) {
                        downloaded.push({
                            id: t.id,
                            title: t.title,
                            artist: t.artist,
                            coverUrl: t.coverUrl,
                            album: t.album || '',
                            downloadedAt: t.downloadedAt || Date.now(),
                            localPath: t.localPath,
                            isNativeDownload: true
                        });
                    }
                });
            }
        } catch (error) {
            console.error("Error al cargar descargas de Capacitor Preferences:", error);
        }

        // Set local tracks immediately
        setTracks(downloaded);

        // Set local playlists immediately so they appear instantly
        const pls = await getAllPlaylists();
        setPlaylists(pls);

        // Pull playlists from the cloud and merge safely in the background
        let mergedPls = [...pls];
        try {
            const cloudPls = await pullPlaylistsFromCloud();
            const localIds = new Set(pls.map(p => p.id));
            let changed = false;
            for (const cp of cloudPls) {
                if (!localIds.has(cp.id)) {
                    mergedPls.push(cp);
                    changed = true;
                }
            }
            if (changed) setPlaylists(mergedPls);
        } catch (e) {
            console.warn("[Library] Cloud playlist pull failed:", e);
        }

        const liked = await getAllLikedTrackIds();

        const cloud = await getUserLibrary();

        // 3. Heal any orphaned liked tracks (from old caches)
        const missingLikedIds = liked.filter(id => !downloaded.some(t => t.id === id) && !cloud.some(t => t.id === id));
        if (missingLikedIds.length > 0) {
            const { saveTrackToDB } = await import('@/lib/db');
            let recovered = false;
            for (const id of missingLikedIds) {
                try {
                    const res = await fetch(`https://api.deezer.com/track/${id}`);
                    if (res.ok) {
                        const dzTrack = await res.json();
                        if (dzTrack.title) {
                            const newTrack: SavedTrack = {
                                id: dzTrack.id.toString(),
                                title: dzTrack.title,
                                artist: dzTrack.artist?.name || 'Unknown Artist',
                                album: dzTrack.album?.title || '',
                                coverUrl: dzTrack.album?.cover_xl || dzTrack.album?.cover_medium || '',
                                previewUrl: dzTrack.preview,
                                streamUrl: `https://caleta-music-production.up.railway.app/api/deezer?id=${dzTrack.id}`,
                                downloadedAt: Date.now()
                            };
                            await saveTrackToDB(newTrack);
                            downloaded.push(newTrack);
                            recovered = true;
                        }
                    }
                } catch (e) {
                    console.warn("Failed to fetch missing liked track", id);
                }
            }
            if (recovered) {
                setTracks([...downloaded]);
            }
        }

        setLikedIds(new Set(liked));
        setCloudTracks(cloud);

        const albums = await getAllSavedAlbums();
        setSavedAlbums(albums);

        return mergedPls;
    };

    useEffect(() => {
        loadLibrary().then((pls) => {
            // Auto-open playlist if ID is in the URL
            if (playlistIdParam && pls && pls.length > 0) {
                const match = pls.find(p => p.id === playlistIdParam);
                if (match) {
                    setSelectedPlaylist(match);
                    setActiveTab("playlists");
                    return; // Don't override tab if we're opening a playlist
                }
            }
            if (tab === "likes") setActiveTab("likes");
            else if (tab === "playlists") setActiveTab("playlists");
        });
    }, [tab, playlistIdParam, user]);

    useEffect(() => {
        const handleLikeUpdate = () => {
            loadLibrary();
        };
        window.addEventListener("caleta:like_updated", handleLikeUpdate);
        return () => window.removeEventListener("caleta:like_updated", handleLikeUpdate);
    }, []);

    // Close context menu on click outside
    useEffect(() => {
        const handler = () => setContextMenuTrackId(null);
        window.addEventListener("click", handler);
        return () => window.removeEventListener("click", handler);
    }, []);

    type UnifiedTrack = SavedTrack & { isCloudOnly?: boolean, sourceAudioUrl?: string };

    const handlePlay = (track: UnifiedTrack) => {
        const list = displayTracks;
        playTrack(track, list as SavedTrack[]);
    };

    const handleDownloadCloud = async (e: React.MouseEvent, track: UnifiedTrack) => {
        e.stopPropagation();

        const mockTrack = {
            trackId: 0,
            trackName: track.title,
            artistName: track.artist,
            collectionName: track.album || "",
            artworkUrl100: track.coverUrl || "",
            previewUrl: track.sourceAudioUrl || "",
            _source: 'deezer'
        } as any;

        let isNative = false;
        try { isNative = Capacitor.isNativePlatform(); } catch { /* web */ }

        if (isNative) {
            let trackDownloadUrl = `https://caleta-music-production.up.railway.app/api/deezer?title=${encodeURIComponent(track.title)}&artist=${encodeURIComponent(track.artist)}`;

            // Fix 404 Native: Add play=true specifically so the API triggers a redirect to the MP3 URL
            trackDownloadUrl += '&play=true';

            const result = await downloadSong({
                id: track.id,
                title: track.title,
                artist: track.artist,
                coverUrl: track.coverUrl || "",
                downloadUrl: trackDownloadUrl
            });

            if (result.success) {
                await loadLibrary();
            } else {
                alert(`Error al descargar: ${result.error || "Error desconocido"}`);
            }
        } else {
            setDownloadingCloudIds(prev => new Set(prev).add(track.id));
            setDownloadProgress(prev => ({ ...prev, [track.id]: 0 }));

            const result = await downloadAndSaveTrack(mockTrack, track.sourceAudioUrl || null, track.id, (progress) => {
                setDownloadProgress(prev => ({ ...prev, [track.id]: progress }));
            });

            if (result.success) {
                await loadLibrary();
            } else {
                alert(`Error al descargar: ${result.error || "Error desconocido"}`);
            }

            setDownloadingCloudIds(prev => {
                const next = new Set(prev);
                next.delete(track.id);
                return next;
            });
            setDownloadProgress(prev => {
                const next = { ...prev };
                delete next[track.id];
                return next;
            });
        }
    };

    const handleDelete = async (id: string) => {
        setDeleteConfirmId(id);
        setContextMenuTrackId(null);
    };

    const confirmDelete = async () => {
        if (deleteConfirmId) {
            const trackIdToDelete = deleteConfirmId;
            setDeleteConfirmId(null);

            // Remove visually immediately for snappiness
            setTracks(prev => prev.filter(t => t.id !== trackIdToDelete));
            setCloudTracks(prev => prev.filter(t => t.id !== trackIdToDelete));

            // Eliminar de Capacitor Preferences (Lógica offline)
            try {
                const { value } = await Preferences.get({ key: 'caleta_downloaded_tracks' });
                if (value) {
                    const tracksData = JSON.parse(value);
                    const updatedTracks = tracksData.filter((t: any) => t.id !== trackIdToDelete);
                    await Preferences.set({
                        key: 'caleta_downloaded_tracks',
                        value: JSON.stringify(updatedTracks)
                    });
                }
            } catch (e) {
                console.error("Error removiendo de Preferences:", e);
            }

            await removeTrackFromDB(trackIdToDelete); // Fallback para data vieja

            // Also remove from cloud so it doesn't re-sync back
            try {
                await removeSongFromLibrary(trackIdToDelete);
            } catch (err) {
                console.error("Failed to delete from cloud:", err);
            }
            await loadLibrary();
        }
    };

    const handleToggleLike = async (e: React.MouseEvent, track: SavedTrack) => {
        e.stopPropagation();
        const nowLiked = await toggleLike(track);
        setLikedIds(prev => {
            const next = new Set(prev);
            if (nowLiked) next.add(track.id);
            else next.delete(track.id);
            return next;
        });
    };

    const handleCreatePlaylist = async (name: string, description: string, coverBlob?: Blob) => {
        try {
            const newPl = await createPlaylist(name, description, coverBlob);
            // Sync to cloud so it appears on other devices
            syncPlaylistToCloud(newPl).catch(e => console.warn("[Sync] Playlist create sync:", e));
        } catch (e) {
            console.error("[Library] Error creating playlist:", e);
        } finally {
            loadLibrary();
        }
    };

    const handleAddToPlaylist = async (playlistId: string, trackId: string) => {
        await addTrackToPlaylist(playlistId, trackId);
        setContextMenuTrackId(null);
        // Re-sync the updated playlist to cloud
        const { getPlaylist } = await import("@/lib/db");
        const updated = await getPlaylist(playlistId);
        if (updated) {
            syncPlaylistToCloud(updated).catch(e => console.warn("[Sync] Playlist update sync:", e));
        }
        loadLibrary();
    };

    const openContextMenu = (e: React.MouseEvent, trackId: string) => {
        e.stopPropagation();
        e.preventDefault();
        setContextMenuTrackId(trackId);
        setContextMenuPos({ x: e.clientX, y: e.clientY });
    };

    const openAlbumDetail = (e: React.MouseEvent, track: SavedTrack) => {
        e.stopPropagation();
        if (track.album) {
            router.push(`/album?name=${encodeURIComponent(track.album)}&artist=${encodeURIComponent(track.artist)}&coverUrl=${encodeURIComponent(track.coverUrl)}`);
        }
    };

    const getMergedTracks = (): UnifiedTrack[] => {
        const localTrackIds = new Set<string>();

        const mergedTracks: UnifiedTrack[] = tracks.map(t => {
            localTrackIds.add(t.id);
            // Local tracks that lack a blob means they were pulled from cloud sync, but not downloaded locally
            const isCloud = !t.blob && !(t as any).isNativeDownload;
            return {
                ...t,
                isCloudOnly: isCloud,
                sourceAudioUrl: t.streamUrl || t.previewUrl || ''
            };
        });

        cloudTracks.forEach(ct => {
            if (!localTrackIds.has(ct.id)) {
                mergedTracks.push({
                    ...ct,
                    isCloudOnly: true,
                    sourceAudioUrl: ct.streamUrl || ct.previewUrl || ''
                });
            }
        });

        return mergedTracks.sort((a, b) => (b.downloadedAt || 0) - (a.downloadedAt || 0));
    };

    const allMergedTracks = getMergedTracks();

    // Liked tracks can include metadata-only tracks
    const likedTracks = allMergedTracks.filter(t => likedIds.has(t.id));

    const filteredLikedTracks = likedTracks.filter(
        t =>
            t.title.toLowerCase().includes(query.toLowerCase()) ||
            t.artist.toLowerCase().includes(query.toLowerCase())
    );

    // 'Canciones' tab should only show truly downloaded tracks or cloud library tracks
    const libraryTracks = allMergedTracks.filter(t =>
        t.blob || (t as any).isNativeDownload || cloudTracks.some(ct => ct.id === t.id) || t.isCloudOnly
    );

    const filteredLibraryTracks = libraryTracks.filter(
        t =>
            t.title.toLowerCase().includes(query.toLowerCase()) ||
            t.artist.toLowerCase().includes(query.toLowerCase())
    );

    const displayTracks = activeTab === "likes" ? filteredLikedTracks : filteredLibraryTracks;

    return (
        <main className="relative p-4 md:p-8 md:pt-10 max-w-7xl mx-auto min-h-screen overflow-hidden">
            {/* Dynamic Background Auras for Premium Feel */}
            <div className="absolute top-0 right-[10%] w-[500px] h-[500px] bg-brand-500/10 rounded-full blur-[140px] -z-10 pointer-events-none" />
            <div className="absolute top-[20%] left-[10%] w-[400px] h-[400px] bg-cyan-500/10 rounded-full blur-[140px] -z-10 pointer-events-none" />

            <header className="mb-10 lg:mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6 px-1 md:px-0">
                <div>
                    <h1 className="text-4xl md:text-5xl font-black text-white mb-3 flex items-center gap-3 md:gap-4 drop-shadow-lg tracking-tight">
                        <LibraryIcon className="text-brand-500 drop-shadow-[0_0_15px_rgba(99,102,241,0.5)]" size={38} strokeWidth={2.5} /> Tu Biblioteca
                    </h1>
                    <p className="text-slate-400 font-medium text-[15px] md:text-lg max-w-sm leading-snug">
                        Música 100% offline, sin anuncios y a tu manera.
                    </p>
                </div>
            </header>

            {/* Tabs */}
            <div className="flex flex-wrap items-center gap-3 md:gap-4 mb-8">
                <button
                    onClick={() => setActiveTab("all")}
                    className={`px-5 py-2.5 rounded-full font-bold text-sm tracking-wide transition-all duration-300 active:scale-95 outline-none focus-visible:ring-4 focus-visible:ring-brand-500/40 ${activeTab === "all"
                        ? "bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.4)]"
                        : "bg-white/[0.04] text-slate-300 hover:bg-white/[0.1] hover:text-white border border-white/[0.05]"
                        }`}
                >
                    Canciones
                </button>
                <button
                    onClick={() => setActiveTab("likes")}
                    className={`px-5 py-2.5 rounded-full font-bold text-sm tracking-wide flex items-center gap-2 transition-all duration-300 active:scale-95 outline-none focus-visible:ring-4 focus-visible:ring-pink-500/40 ${activeTab === "likes"
                        ? "bg-pink-500 text-white shadow-[0_0_20px_rgba(236,72,153,0.4)]"
                        : "bg-white/[0.04] text-slate-300 hover:bg-white/[0.1] hover:text-pink-100 border border-white/[0.05]"
                        }`}
                >
                    <Heart size={16} fill={activeTab === "likes" ? "currentColor" : "none"} />
                    Favoritas
                </button>
                <button
                    onClick={() => setActiveTab("albums")}
                    className={`px-5 py-2.5 rounded-full font-bold text-sm tracking-wide flex items-center gap-2 transition-all duration-300 active:scale-95 outline-none focus-visible:ring-4 focus-visible:ring-emerald-500/40 ${activeTab === "albums"
                        ? "bg-emerald-500 text-white shadow-[0_0_20px_rgba(16,185,129,0.4)]"
                        : "bg-white/[0.04] text-slate-300 hover:bg-white/[0.1] hover:text-emerald-100 border border-white/[0.05]"
                        }`}
                >
                    <Disc3 size={16} />
                    Álbumes
                </button>
                <button
                    onClick={() => setActiveTab("playlists")}
                    className={`px-5 py-2.5 rounded-full font-bold text-sm tracking-wide flex items-center gap-2 transition-all duration-300 active:scale-95 outline-none focus-visible:ring-4 focus-visible:ring-brand-500/40 ${activeTab === "playlists"
                        ? "bg-brand-500 text-white shadow-[0_0_20px_rgba(99,102,241,0.4)]"
                        : "bg-white/[0.04] text-slate-300 hover:bg-white/[0.1] hover:text-brand-100 border border-white/[0.05]"
                        }`}
                >
                    <ListMusic size={16} />
                    Playlists
                </button>

                <div className="flex-1 min-w-[10px]"></div>

                <button
                    onClick={() => setShowCreateModal(true)}
                    className="bg-brand-500/10 hover:bg-brand-500 text-brand-400 hover:text-white border border-brand-500/30 px-5 py-2.5 rounded-full font-bold text-sm hidden md:flex items-center gap-2 transition-all duration-300 ml-auto outline-none focus-visible:ring-4 focus-visible:ring-brand-500/40 hover:shadow-[0_0_20px_rgba(99,102,241,0.3)] active:scale-95"
                >
                    <Plus size={18} strokeWidth={2.5} /> <span>Nueva Playlist</span>
                </button>
            </div>

            {/* Playlists Tab */}
            {activeTab === "playlists" && (
                <section className="mb-10 animate-fade-in-up">
                    {playlists.length === 0 ? (
                        <div className="relative overflow-hidden rounded-[2rem] border border-white/[0.04] bg-[#060913]/40 backdrop-blur-xl shadow-inner mt-4 py-24 px-4 text-center">
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-slate-800/20 blur-[80px] rounded-full pointer-events-none" />
                            <div className="w-20 h-20 bg-gradient-to-br from-brand-500/10 to-brand-500/5 rounded-[24px] flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(99,102,241,0.1)] border border-brand-500/10 mx-auto">
                                <ListMusic size={36} className="text-brand-500 opacity-60" strokeWidth={1.5} />
                            </div>
                            <h3 className="text-2xl font-black text-white mb-2 tracking-tight">
                                Sin playlists organizadas
                            </h3>
                            <p className="text-slate-400 max-w-sm mx-auto mb-8 font-medium">
                                Comienza a organizar tu música favorita. Crea una playlist y añade canciones desde tu biblioteca.
                            </p>
                            <button
                                onClick={() => setShowCreateModal(true)}
                                className="bg-brand-500 hover:bg-brand-400 text-white px-8 py-3.5 rounded-full font-bold transition-all duration-300 shadow-lg hover:shadow-[0_8px_25px_rgba(99,102,241,0.4)] active:scale-95 outline-none focus-visible:ring-4 focus-visible:ring-brand-400/50"
                            >
                                <Plus size={20} className="inline mr-2" strokeWidth={2.5} />
                                Empezar a Crear
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-5">
                            {/* Create New Card */}
                            <button
                                onClick={() => setShowCreateModal(true)}
                                aria-label="Crear nueva playlist"
                                className="aspect-square rounded-[24px] border-2 border-dashed border-white/[0.05] hover:border-brand-500/30 hover:bg-white/[0.01] flex flex-col items-center justify-center gap-4 text-slate-500 hover:text-brand-300 transition-all duration-300 group outline-none focus-visible:ring-4 focus-visible:ring-brand-500/40 active:scale-[0.98] card-glow"
                            >
                                <div className="w-16 h-16 rounded-full bg-white/[0.03] group-hover:bg-brand-500/20 flex items-center justify-center transition-all duration-500 group-hover:scale-110 shadow-lg group-hover:shadow-[0_0_20px_rgba(99,102,241,0.2)]">
                                    <Plus size={32} strokeWidth={1.5} className="group-hover:text-brand-400 transition-colors" />
                                </div>
                                <span className="text-sm font-bold tracking-wide">Nueva Playlist</span>
                            </button>

                            {/* Existing Playlists */}
                            {playlists.map(pl => {
                                const coverBlobUrl = pl.coverBlob ? URL.createObjectURL(pl.coverBlob) : null;
                                return (
                                    <button
                                        key={pl.id}
                                        onClick={() => router.push(`/playlist?id=${pl.id}`)}
                                        aria-label={`Abrir playlist ${pl.name}`}
                                        className="bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.02] hover:border-white/[0.08] rounded-[24px] p-3.5 md:p-4 text-left transition-all duration-500 ease-out group hover:-translate-y-1.5 hover:shadow-[0_15px_40px_rgba(0,0,0,0.4)] active:scale-[0.98] outline-none focus-visible:ring-4 focus-visible:ring-brand-500/40 relative overflow-hidden flex flex-col"
                                    >
                                        <div className="w-full aspect-square rounded-[16px] overflow-hidden shadow-[0_10px_30px_rgba(0,0,0,0.4)] mb-4 bg-[#0a0f1e] border border-white/[0.05] relative z-10 flex-shrink-0">
                                            {coverBlobUrl ? (
                                                <img
                                                    src={coverBlobUrl}
                                                    alt={pl.name}
                                                    className="w-full h-full object-cover transform transition-transform duration-700 ease-out group-hover:scale-110"
                                                />
                                            ) : pl.coverUrl ? (
                                                <img
                                                    src={pl.coverUrl}
                                                    alt={pl.name}
                                                    className="w-full h-full object-cover transform transition-transform duration-700 ease-out group-hover:scale-110"
                                                />
                                            ) : (
                                                <div className="w-full h-full bg-gradient-to-br from-slate-800 to-slate-900 group-hover:from-slate-700 group-hover:to-slate-800 transition-colors duration-500 flex items-center justify-center">
                                                    <ListMusic size={48} className="text-slate-600 group-hover:text-slate-400 group-hover:scale-110 transition-all duration-500" strokeWidth={1} />
                                                </div>
                                            )}
                                        </div>
                                        <div className="relative z-10 flex-1 flex flex-col">
                                            <h3 className="font-bold text-white text-[15px] truncate drop-shadow-sm leading-tight transition-colors mb-0.5">
                                                {pl.name}
                                            </h3>
                                            <p className="text-[12px] font-medium text-slate-400 truncate mt-auto">
                                                {pl.trackIds.length} canci{pl.trackIds.length !== 1 ? "ones" : "ón"}
                                            </p>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </section>
            )
            }

            {/* Albums Tab */}
            {activeTab === "albums" && (
                <section className="mb-10 animate-fade-in-up">
                    {/* Combine explicitly saved albums with smart grouping (threshold > 1) */}
                    {(() => {
                        // All tracks grouped by album
                        const albumMap = allMergedTracks.reduce((acc, track) => {
                            if (track.album) {
                                const key = `${track.album}||${track.artist}`;
                                if (!acc.has(key)) acc.set(key, { name: track.album, artist: track.artist, cover: track.coverUrl, count: 0 });
                                acc.get(key)!.count++;
                            }
                            return acc;
                        }, new Map<string, { name: string, artist: string, cover: string, count: number }>());

                        // Filter groups to only show those with > 2 songs (to avoid single-song clutter)
                        // OR those that are explicitly in savedAlbums.
                        const groupedAlbums = Array.from(albumMap.values()).filter(a => a.count > 2);

                        // If no saved albums and no significantly downloaded albums
                        if (savedAlbums.length === 0 && groupedAlbums.length === 0) {
                            return (
                                <div className="relative overflow-hidden rounded-[2rem] border border-white/[0.04] bg-[#060913]/40 backdrop-blur-xl shadow-inner mt-4 py-24 px-4 text-center">
                                    <div className="w-20 h-20 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 rounded-full flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(16,185,129,0.1)] border border-emerald-500/10 mx-auto">
                                        <Disc3 size={36} className="text-emerald-500 opacity-60" strokeWidth={1.5} />
                                    </div>
                                    <h3 className="text-2xl font-black text-white mb-2 tracking-tight">Tu biblioteca de álbumes está vacía</h3>
                                    <p className="text-slate-400 max-w-sm mx-auto mb-8 font-medium">Guarda álbumes con el icono de corazón o descarga álbumes completos para verlos aquí.</p>
                                </div>
                            );
                        }

                        // Use SavedAlbums as base, then complement with grouped albums not already in savedAlbums
                        const displayAlbums = [...savedAlbums.map(sa => ({ ...sa, fromSaved: true }))];

                        groupedAlbums.forEach(ga => {
                            if (!displayAlbums.some(da => da.name === ga.name && da.artist === ga.artist)) {
                                displayAlbums.push({ ...ga, fromSaved: false, id: `grouped-${ga.name}`, savedAt: 0 } as any);
                            }
                        });

                        return (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-5">
                                {displayAlbums.map((album, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => router.push(`/album?name=${encodeURIComponent(album.name)}&artist=${encodeURIComponent(album.artist)}&coverUrl=${encodeURIComponent(album.coverUrl || (album as any).cover)}`)}
                                        className="bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.02] hover:border-white/[0.08] rounded-[24px] p-3.5 md:p-4 text-left transition-all duration-500 ease-out group hover:-translate-y-1.5 hover:shadow-[0_15px_40px_rgba(0,0,0,0.4)] active:scale-[0.98] outline-none focus-visible:ring-4 focus-visible:ring-emerald-500/40 relative overflow-hidden flex flex-col"
                                    >
                                        <div className="w-full aspect-square rounded-[16px] overflow-hidden shadow-[0_10px_30px_rgba(0,0,0,0.4)] mb-4 bg-[#0a0f1e] border border-white/[0.05] flex-shrink-0">
                                            <img src={(album.coverUrl || (album as any).cover) || '/placeholder.png'} alt={album.name} className="w-full h-full object-cover transform transition-transform duration-700 ease-out group-hover:scale-110" />
                                        </div>
                                        <h3 className="font-bold text-white text-[15px] truncate drop-shadow-sm leading-tight mb-0.5 group-hover:text-emerald-400 transition-colors">{album.name}</h3>
                                        <p className="text-[12px] font-medium text-slate-400 truncate mt-auto">{album.artist}</p>
                                        <p className="text-[10px] text-slate-500 font-bold mt-1">
                                            {(album as any).fromSaved ? 'Álbum guardado' : `${(album as any).count} canciones`}
                                        </p>
                                    </button>
                                ))}
                            </div>
                        );
                    })()}
                </section>
            )}


            {/* Tracks Tab (All or Likes) */}
            {
                activeTab !== "playlists" && activeTab !== "albums" && (
                    <>
                        {/* Search bar */}
                        <div className="relative mb-8 max-w-xl group">
                            <div className="absolute inset-0 bg-gradient-to-r from-brand-500/20 to-cyan-500/20 rounded-2xl blur group-focus-within:opacity-100 opacity-0 transition-opacity duration-500" />
                            <div className="relative">
                                <Search
                                    className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-brand-400 transition-colors"
                                    size={22}
                                />
                                <input
                                    type="text"
                                    value={query}
                                    onChange={e => setQuery(e.target.value)}
                                    placeholder={
                                        activeTab === "likes"
                                            ? "Buscar en tus favoritas..."
                                            : "Buscar en tus descargas..."
                                    }
                                    className="w-full bg-[#0a0f1e]/80 backdrop-blur-md border border-white/[0.05] focus:border-brand-500/50 text-white rounded-2xl py-4 pl-14 pr-4 focus:ring-4 focus:ring-brand-500/10 outline-none transition-all duration-300 placeholder-slate-500 font-medium text-[15px] shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
                                />
                            </div>
                        </div>

                        <div className="flex flex-col gap-2">
                            {displayTracks.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-24 md:py-32 px-4 relative overflow-hidden rounded-[2rem] border border-white/[0.04] bg-[#060913]/40 backdrop-blur-xl shadow-inner mt-4">
                                    {/* Decorative background elements */}
                                    <div className="absolute inset-0 pointer-events-none">
                                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-slate-800/20 blur-[80px] rounded-full" />
                                    </div>

                                    {activeTab === "likes" ? (
                                        <>
                                            <div className="w-20 h-20 bg-gradient-to-br from-pink-500/10 to-pink-500/5 rounded-full flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(236,72,153,0.1)] border border-pink-500/10 relative group">
                                                <div className="absolute inset-0 bg-pink-500/20 rounded-full animate-ping opacity-20" />
                                                <Heart
                                                    size={32}
                                                    className="text-pink-400 drop-shadow-lg"
                                                />
                                            </div>
                                            <h3 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400 mb-2">
                                                Sin favoritos
                                            </h3>
                                            <p className="text-slate-400 font-medium text-center max-w-sm">
                                                Tus canciones más queridas aparecerán aquí. Toca el corazón en cualquier canción para guardarla.
                                            </p>
                                        </>
                                    ) : (
                                        <>
                                            <div className="w-20 h-20 bg-gradient-to-br from-brand-500/10 to-brand-500/5 rounded-full flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(99,102,241,0.1)] border border-brand-500/10 relative group">
                                                <Music
                                                    size={32}
                                                    className="text-brand-400 drop-shadow-lg"
                                                />
                                            </div>
                                            <h3 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400 mb-2">
                                                Tu biblioteca está vacía
                                            </h3>
                                            <p className="text-slate-400 font-medium text-center max-w-sm">
                                                Busca y descarga canciones para escucharlas sin conexión en cualquier momento.
                                            </p>
                                        </>
                                    )}
                                </div>
                            ) : (
                                <>
                                    {/* Table Header */}
                                    <div className="hidden md:grid grid-cols-[40px_minmax(0,1.5fr)_minmax(0,1fr)_40px_40px] gap-4 px-5 py-3 text-xs text-slate-400 font-bold uppercase tracking-widest border-b border-white/[0.05] mb-4">
                                        <div className="w-8 text-center text-slate-500">#</div>
                                        <div>Título</div>
                                        <div className="hidden md:block w-48 lg:w-64 truncate">Álbum</div>
                                        <div className="w-10"></div>
                                        <div className="w-10"></div>
                                    </div>

                                    {/* Track Rows */}
                                    {displayTracks.map((track, idx) => {
                                        const isCurrent = currentTrack?.id === track.id;
                                        const isLiked = likedIds.has(track.id);

                                        return (
                                            <div
                                                key={track.id}
                                                onClick={() => handlePlay(track)}
                                                className={`group grid grid-cols-[32px_1fr_40px_40px] md:grid-cols-[40px_minmax(0,1.5fr)_minmax(0,1fr)_40px_40px] items-center gap-3 md:gap-4 px-3 md:px-5 py-3 rounded-[16px] transition-all duration-300 ease-out cursor-pointer ${isCurrent
                                                    ? "bg-brand-500/10 shadow-[0_0_20px_rgba(99,102,241,0.15)] border border-brand-500/20"
                                                    : "bg-transparent hover:bg-white/[0.04] border border-transparent hover:border-white/[0.03] hover:shadow-lg"
                                                    }`}
                                            >
                                                {/* Track number */}
                                                <div className="w-6 md:w-8 flex-shrink-0 flex items-center justify-center font-bold text-[13px] text-slate-500 group-hover:text-white transition-colors relative">
                                                    {isCurrent && isPlaying ? (
                                                        <Music
                                                            size={16}
                                                            className="text-brand-500 animate-[bounce_1s_infinite]"
                                                            strokeWidth={3}
                                                        />
                                                    ) : (
                                                        <span className="group-hover:opacity-0 transition-opacity duration-200">
                                                            {idx + 1}
                                                        </span>
                                                    )}
                                                    {!isCurrent && (
                                                        <Play
                                                            size={16}
                                                            fill="currentColor"
                                                            className="text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                                                        />
                                                    )}
                                                    {isCurrent && !isPlaying && !track.isCloudOnly && (
                                                        <Play
                                                            size={16}
                                                            fill="currentColor"
                                                            className="text-brand-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                                                        />
                                                    )}
                                                </div>

                                                {/* Track info */}
                                                <div className="flex items-center gap-4 min-w-0">
                                                    <img
                                                        src={
                                                            track.coverUrl || "/placeholder.png"
                                                        }
                                                        className={`w-10 h-10 rounded shadow-md object-cover flex-shrink-0 ${isCurrent
                                                            ? "ring-2 ring-brand-500 ring-offset-2 ring-offset-[#0f172a]"
                                                            : ""
                                                            }`}
                                                        alt=""
                                                    />
                                                    <div className="flex flex-col min-w-0">
                                                        <span
                                                            className={`font-bold text-[15px] truncate transition-colors leading-tight ${isCurrent
                                                                ? "text-brand-400"
                                                                : "text-white group-hover:text-brand-100"
                                                                }`}
                                                        >
                                                            {track.title}
                                                        </span>
                                                        <span className="text-[13px] font-medium text-slate-400 truncate mt-[1px]">
                                                            {track.artist}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Album (clickable) */}
                                                <div className="hidden md:flex min-w-0 w-full items-center">
                                                    {track.album ? (
                                                        <button
                                                            onClick={e => openAlbumDetail(e, track)}
                                                            className="text-sm text-slate-400 hover:text-brand-400 hover:underline truncate w-full text-left transition-colors"
                                                            title={`Ver álbum: ${track.album}`}
                                                        >
                                                            {track.album}
                                                        </button>
                                                    ) : (
                                                        <span className="text-sm text-slate-500">
                                                            -
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Like button */}
                                                <div className="w-10 flex-shrink-0 flex justify-center">
                                                    <button
                                                        onClick={e => handleToggleLike(e, track)}
                                                        className={`p-2 rounded-full transition-all ${isLiked
                                                            ? "text-pink-500 hover:text-pink-400"
                                                            : "text-slate-500 hover:text-pink-500 md:opacity-0 md:group-hover:opacity-100"
                                                            }`}
                                                        title={isLiked ? "Quitar me gusta" : "Me gusta"}
                                                    >
                                                        <Heart
                                                            size={18}
                                                            fill={isLiked ? "currentColor" : "none"}
                                                        />
                                                    </button>
                                                </div>

                                                <div className="w-10 flex-shrink-0 flex justify-end items-center">
                                                    {track.isCloudOnly ? (
                                                        (downloadingCloudIds.has(track.id) || downloadingIds[track.id]) ? (
                                                            <div className="relative flex items-center justify-center w-8 h-8" title={`${downloadProgress[track.id] || nativeDownloadProgress[track.id] || 0}%`}>
                                                                <Loader size={18} className="animate-spin text-brand-500" />
                                                                <span className="absolute text-[8px] font-bold text-white">
                                                                    {downloadProgress[track.id] || nativeDownloadProgress[track.id] || 0}
                                                                </span>
                                                            </div>
                                                        ) : (
                                                            <button
                                                                onClick={e => handleDownloadCloud(e, track)}
                                                                className="text-slate-400 hover:text-brand-400 p-2 rounded-full hover:bg-brand-500/10 transition-colors md:opacity-0 md:group-hover:opacity-100"
                                                                title="Descargar desde la nube para escuchar offline"
                                                            >
                                                                <CloudDownload size={18} />
                                                            </button>
                                                        )
                                                    ) : (
                                                        <button
                                                            onClick={e => openContextMenu(e, track.id)}
                                                            className="text-slate-500 hover:text-white p-2 rounded-full hover:bg-slate-800 transition-colors md:opacity-0 md:group-hover:opacity-100"
                                                            title="Más opciones"
                                                        >
                                                            <MoreHorizontal size={18} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </>
                            )}
                        </div>
                    </>
                )
            }

            {/* Context Menu */}
            {
                contextMenuTrackId && (
                    <div
                        className="fixed z-[90] bg-slate-800 border border-slate-700 rounded-xl shadow-2xl py-2 w-56 backdrop-blur-xl"
                        style={{
                            top: Math.min(contextMenuPos.y, window.innerHeight - 250),
                            left: Math.min(contextMenuPos.x, window.innerWidth - 240),
                        }}
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Add to playlist options */}
                        <p className="px-4 py-1.5 text-xs text-slate-500 uppercase font-bold tracking-wider">
                            Agregar a playlist
                        </p>
                        {playlists.length === 0 ? (
                            <p className="px-4 py-2 text-sm text-slate-400">
                                Sin playlists aún
                            </p>
                        ) : (
                            playlists.map(pl => (
                                <button
                                    key={pl.id}
                                    onClick={() =>
                                        handleAddToPlaylist(pl.id, contextMenuTrackId!)
                                    }
                                    className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors flex items-center gap-2"
                                >
                                    <ListMusic size={14} />
                                    {pl.name}
                                </button>
                            ))
                        )}
                        <div className="h-px bg-slate-700 my-1" />
                        <button
                            onClick={e => {
                                e.stopPropagation();
                                handleDelete(contextMenuTrackId!);
                            }}
                            className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-2"
                        >
                            <Trash2 size={14} />
                            Eliminar descarga
                        </button>
                    </div>
                )
            }

            <CreatePlaylistModal
                isOpen={showCreateModal}
                onClose={() => setShowCreateModal(false)}
                onCreated={handleCreatePlaylist}
            />

            {/* Playlist Detail Modal */}
            <PlaylistDetailModal
                isOpen={!!selectedPlaylist}
                onClose={() => setSelectedPlaylist(null)}
                playlist={selectedPlaylist}
                onUpdated={loadLibrary}
            />

            {/* Delete Confirmation Modal */}
            {deleteConfirmId && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-[#060913]/80 backdrop-blur-md outline-none" onClick={() => setDeleteConfirmId(null)} />
                    <div className="relative w-full max-w-sm bg-slate-900 border border-slate-700/50 rounded-3xl p-6 shadow-2xl animate-scaleIn">
                        <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4 border border-red-500/20">
                            <Trash2 size={24} className="text-red-400" />
                        </div>
                        <h3 className="text-xl font-bold text-white mb-2">Eliminar descarga</h3>
                        <p className="text-slate-400 text-sm mb-6">¿Estás seguro de que quieres eliminar esta canción de tu dispositivo? Necesitarás internet para volver a escucharla.</p>
                        <div className="flex gap-3">
                            <button onClick={() => setDeleteConfirmId(null)} className="flex-1 py-3 text-sm font-bold text-white hover:bg-white/10 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-white">
                                Cancelar
                            </button>
                            <button onClick={confirmDelete} className="flex-1 py-3 text-sm font-bold bg-red-500 hover:bg-red-600 text-white rounded-full transition-colors shadow-lg hover:shadow-red-500/25 focus-visible:ring-2 focus-visible:ring-red-400">
                                Eliminar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main >
    );
}

export default function LibraryPage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center p-20">
                <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        }>
            <LibraryContent />
        </Suspense>
    );
}

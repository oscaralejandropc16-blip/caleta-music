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
} from "@/lib/db";
import { downloadAndSaveTrack } from "@/lib/download";
import { getUserLibrary } from "@/lib/syncLibrary";
import { usePlayer } from "@/context/PlayerContext";
import { useSearchParams, useRouter } from "next/navigation";
import CreatePlaylistModal from "@/components/CreatePlaylistModal";
import AlbumDetailModal from "@/components/AlbumDetailModal";
import PlaylistDetailModal from "@/components/PlaylistDetailModal";

function LibraryContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const tab = searchParams.get("tab");
    const playlistIdParam = searchParams.get("playlist");

    const [tracks, setTracks] = useState<SavedTrack[]>([]);
    const [cloudTracks, setCloudTracks] = useState<SavedTrack[]>([]);
    const [downloadingCloudIds, setDownloadingCloudIds] = useState<Set<string>>(new Set());
    const [playlists, setPlaylists] = useState<Playlist[]>([]);
    const [query, setQuery] = useState("");
    const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
    const [activeTab, setActiveTab] = useState<"all" | "likes" | "playlists">("all");
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [contextMenuTrackId, setContextMenuTrackId] = useState<string | null>(null);
    const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

    // Playlist detail modal state
    const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);

    // Album detail modal state
    const [albumModal, setAlbumModal] = useState<{
        open: boolean;
        album: string;
        artist: string;
        cover: string;
    }>({ open: false, album: "", artist: "", cover: "" });

    const { playTrack, currentTrack, isPlaying } = usePlayer();

    const loadLibrary = async () => {
        const downloaded = await getAllTracksFromDB();
        setTracks(downloaded);
        const pls = await getAllPlaylists();
        setPlaylists(pls);
        const liked = await getAllLikedTrackIds();
        setLikedIds(new Set(liked));

        const cloud = await getUserLibrary();
        setCloudTracks(cloud);

        return pls;
    };

    useEffect(() => {
        loadLibrary().then((pls) => {
            // Auto-open playlist if ID is in the URL
            if (playlistIdParam && pls.length > 0) {
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
    }, [tab, playlistIdParam]);

    // Close context menu on click outside
    useEffect(() => {
        const handler = () => setContextMenuTrackId(null);
        window.addEventListener("click", handler);
        return () => window.removeEventListener("click", handler);
    }, []);

    type UnifiedTrack = SavedTrack & { isCloudOnly?: boolean, sourceAudioUrl?: string };

    const handlePlay = (track: UnifiedTrack) => {
        const list = activeTab === "likes" ? likedTracks : filteredTracks;
        playTrack(track, list as SavedTrack[]);
    };

    const handleDownloadCloud = async (e: React.MouseEvent, track: UnifiedTrack) => {
        e.stopPropagation();
        if (!track.sourceAudioUrl) return;

        setDownloadingCloudIds(prev => new Set(prev).add(track.id));
        const result = await downloadAndSaveTrack(null, track.sourceAudioUrl, track.id);

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
    };

    const handleDelete = async (id: string) => {
        setDeleteConfirmId(id);
        setContextMenuTrackId(null);
    };

    const confirmDelete = async () => {
        if (deleteConfirmId) {
            await removeTrackFromDB(deleteConfirmId);
            loadLibrary();
            setDeleteConfirmId(null);
        }
    };

    const handleToggleLike = async (e: React.MouseEvent, trackId: string) => {
        e.stopPropagation();
        const nowLiked = await toggleLike(trackId);
        setLikedIds(prev => {
            const next = new Set(prev);
            if (nowLiked) next.add(trackId);
            else next.delete(trackId);
            return next;
        });
    };

    const handleCreatePlaylist = async (name: string, description: string, coverBlob?: Blob) => {
        await createPlaylist(name, description, coverBlob);
        loadLibrary();
    };

    const handleAddToPlaylist = async (playlistId: string, trackId: string) => {
        await addTrackToPlaylist(playlistId, trackId);
        setContextMenuTrackId(null);
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
            setAlbumModal({
                open: true,
                album: track.album,
                artist: track.artist,
                cover: track.coverUrl,
            });
        }
    };

    const getMergedTracks = (): UnifiedTrack[] => {
        const mergedTracks: UnifiedTrack[] = [...tracks];
        const localTrackIds = new Set(tracks.map(t => t.id));

        cloudTracks.forEach(ct => {
            if (!localTrackIds.has(ct.id)) {
                mergedTracks.push({
                    ...ct,
                    isCloudOnly: true,
                    sourceAudioUrl: ct.streamUrl || ct.previewUrl || ''
                });
            }
        });

        return mergedTracks.sort((a, b) => b.downloadedAt - a.downloadedAt);
    };

    const allMergedTracks = getMergedTracks();

    const filteredTracks = allMergedTracks.filter(
        t =>
            t.title.toLowerCase().includes(query.toLowerCase()) ||
            t.artist.toLowerCase().includes(query.toLowerCase())
    );

    const likedTracks = allMergedTracks.filter(t => likedIds.has(t.id));
    const displayTracks = activeTab === "likes" ? likedTracks : filteredTracks;

    return (
        <main className="p-4 md:p-8 max-w-7xl mx-auto">
            <header className="mb-10 flex items-center justify-between">
                <div>
                    <h1 className="text-4xl font-bold mb-2 flex items-center gap-3">
                        <LibraryIcon className="text-brand-500" size={32} /> Tu Biblioteca
                    </h1>
                    <p className="text-slate-400 text-lg">
                        Música 100% offline y sin consumo de datos.
                    </p>
                </div>
            </header>

            {/* Tabs */}
            <div className="flex items-center gap-3 mb-8 overflow-x-auto pb-2">
                <button
                    onClick={() => setActiveTab("all")}
                    className={`px-6 py-2 rounded-full font-bold flex-shrink-0 transition-all ${activeTab === "all"
                        ? "bg-white text-black"
                        : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                        }`}
                >
                    Todas las Canciones
                </button>
                <button
                    onClick={() => setActiveTab("likes")}
                    className={`px-6 py-2 rounded-full font-bold flex items-center gap-2 flex-shrink-0 transition-all ${activeTab === "likes"
                        ? "bg-pink-500 text-white"
                        : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                        }`}
                >
                    <Heart size={16} fill={activeTab === "likes" ? "currentColor" : "none"} />
                    Me Gusta ({likedIds.size})
                </button>
                <button
                    onClick={() => setActiveTab("playlists")}
                    className={`px-6 py-2 rounded-full font-bold flex items-center gap-2 flex-shrink-0 transition-all ${activeTab === "playlists"
                        ? "bg-brand-500 text-white"
                        : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                        }`}
                >
                    <ListMusic size={16} />
                    Playlists
                </button>
                <button
                    onClick={() => setShowCreateModal(true)}
                    className="bg-slate-800 hover:bg-slate-700 text-white px-5 py-2 rounded-full font-bold flex items-center gap-2 transition-colors flex-shrink-0 ml-auto"
                >
                    <Plus size={18} /> Nueva Playlist
                </button>
            </div>

            {/* Playlists Tab */}
            {activeTab === "playlists" && (
                <section className="mb-10">
                    {playlists.length === 0 ? (
                        <div className="text-center py-20 bg-slate-900/40 rounded-3xl border border-slate-800">
                            <ListMusic size={48} className="mx-auto text-slate-600 mb-4" />
                            <h3 className="text-xl font-medium text-slate-400">
                                No tienes playlists aún
                            </h3>
                            <p className="text-slate-500 mb-6">
                                Crea tu primera playlist para organizar tu música.
                            </p>
                            <button
                                onClick={() => setShowCreateModal(true)}
                                className="bg-brand-500 hover:bg-brand-400 text-white px-8 py-3.5 rounded-full font-bold transition-all duration-300 shadow-lg hover:shadow-[0_8px_25px_rgba(99,102,241,0.5)] active:scale-95 outline-none focus-visible:ring-4 focus-visible:ring-brand-400/50"
                            >
                                <Plus size={20} className="inline mr-2" strokeWidth={2.5} />
                                Crear Playlist
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
                            {/* Create New Card */}
                            <button
                                onClick={() => setShowCreateModal(true)}
                                aria-label="Crear nueva playlist"
                                className="aspect-square rounded-3xl border-2 border-dashed border-white/10 hover:border-brand-500/50 hover:bg-brand-500/5 flex flex-col items-center justify-center gap-4 text-slate-400 hover:text-brand-400 transition-all duration-300 group outline-none focus-visible:ring-4 focus-visible:ring-brand-500/40 active:scale-[0.98]"
                            >
                                <div className="w-16 h-16 rounded-full bg-slate-800/80 group-hover:bg-brand-500/20 flex items-center justify-center transition-all duration-500 group-hover:scale-110 shadow-lg group-hover:shadow-[0_0_20px_rgba(99,102,241,0.3)] border border-white/5">
                                    <Plus size={32} className="text-slate-500 group-hover:text-brand-400 transition-colors" />
                                </div>
                                <span className="text-sm font-bold tracking-wide">Nueva Playlist</span>
                            </button>

                            {/* Existing Playlists */}
                            {playlists.map(pl => {
                                const coverBlobUrl = pl.coverBlob ? URL.createObjectURL(pl.coverBlob) : null;
                                return (
                                    <button
                                        key={pl.id}
                                        onClick={() => router.push(`/playlist/${pl.id}`)}
                                        aria-label={`Abrir playlist ${pl.name}`}
                                        className="bg-white/[0.03] hover:bg-white/[0.08] border border-transparent hover:border-white/[0.04] rounded-3xl p-4 text-left transition-all duration-300 group card-glow active:scale-[0.98] outline-none focus-visible:ring-4 focus-visible:ring-brand-500/40 relative overflow-hidden"
                                    >
                                        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-brand-900/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                                        <div className="w-full aspect-square rounded-2xl overflow-hidden shadow-[0_15px_30px_rgba(0,0,0,0.3)] mb-4 bg-slate-800/80 relative z-10">
                                            {coverBlobUrl ? (
                                                <img
                                                    src={coverBlobUrl}
                                                    alt={pl.name}
                                                    className="w-full h-full object-cover transform transition-transform duration-700 ease-out group-hover:scale-110"
                                                />
                                            ) : (
                                                <div className="w-full h-full bg-gradient-to-br from-slate-800 to-slate-900 group-hover:from-slate-700 group-hover:to-slate-800 transition-colors duration-500 flex items-center justify-center border border-white/5">
                                                    <ListMusic size={48} className="text-slate-600 group-hover:text-slate-400 transition-colors duration-500" strokeWidth={1.5} />
                                                </div>
                                            )}
                                        </div>
                                        <div className="relative z-10 px-1">
                                            <h3 className="font-bold text-white text-[15px] truncate drop-shadow-sm group-hover:text-brand-300 transition-colors">
                                                {pl.name}
                                            </h3>
                                            <p className="text-[11px] font-bold text-slate-500/80 uppercase tracking-widest mt-1">
                                                {pl.trackIds.length} canci{pl.trackIds.length !== 1 ? "ones" : "ón"}
                                            </p>
                                            {pl.description && (
                                                <p className="text-xs text-slate-400 mt-2 line-clamp-2 leading-relaxed">
                                                    {pl.description}
                                                </p>
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </section>
            )
            }

            {/* Tracks Tab (All or Likes) */}
            {
                activeTab !== "playlists" && (
                    <>
                        {/* Search bar */}
                        <div className="relative mb-8 max-w-lg">
                            <Search
                                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"
                                size={20}
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
                                className="w-full bg-slate-800/50 border border-slate-700 text-white rounded-xl py-3 pl-12 pr-4 focus:ring-2 focus:ring-brand-500 outline-none transition-all placeholder-slate-500"
                            />
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
                                    <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 px-4 py-2 text-sm text-slate-500 font-medium uppercase tracking-wider border-b border-slate-800 mb-2">
                                        <div className="w-8 text-center">#</div>
                                        <div>Título</div>
                                        <div className="hidden md:block w-48 truncate">Álbum</div>
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
                                                className={`group grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-4 px-4 py-3 rounded-xl transition-all cursor-pointer ${isCurrent
                                                    ? "bg-white/10 shadow-[0_0_20px_rgba(255,255,255,0.05)]"
                                                    : "hover:bg-slate-800/80"
                                                    }`}
                                            >
                                                {/* Track number */}
                                                <div className="w-8 flex items-center justify-center font-medium text-slate-400 group-hover:text-white">
                                                    {isCurrent && isPlaying ? (
                                                        <Music
                                                            size={16}
                                                            className="text-brand-500 animate-pulse"
                                                        />
                                                    ) : (
                                                        <span className="group-hover:hidden">
                                                            {idx + 1}
                                                        </span>
                                                    )}
                                                    {!isCurrent && (
                                                        <Play
                                                            size={16}
                                                            fill="currentColor"
                                                            className="text-white hidden group-hover:block"
                                                        />
                                                    )}
                                                    {isCurrent && !isPlaying && !track.isCloudOnly && (
                                                        <Play
                                                            size={16}
                                                            fill="currentColor"
                                                            className="text-brand-500 hidden group-hover:block"
                                                        />
                                                    )}
                                                    {track.isCloudOnly && (
                                                        <Cloud
                                                            size={16}
                                                            className="text-slate-500"
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
                                                            className={`font-semibold truncate ${isCurrent
                                                                ? "text-brand-400"
                                                                : "text-white"
                                                                }`}
                                                        >
                                                            {track.title}
                                                        </span>
                                                        <span className="text-sm text-slate-400 truncate">
                                                            {track.artist}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Album (clickable) */}
                                                <div className="hidden md:block w-48">
                                                    {track.album ? (
                                                        <button
                                                            onClick={e => openAlbumDetail(e, track)}
                                                            className="text-sm text-slate-400 hover:text-brand-400 hover:underline truncate block text-left transition-colors"
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
                                                <div className="w-10 flex justify-center">
                                                    <button
                                                        onClick={e => handleToggleLike(e, track.id)}
                                                        className={`p-2 rounded-full transition-all ${isLiked
                                                            ? "text-pink-500 hover:text-pink-400"
                                                            : "text-slate-500 hover:text-pink-500 opacity-0 group-hover:opacity-100"
                                                            }`}
                                                        title={isLiked ? "Quitar me gusta" : "Me gusta"}
                                                    >
                                                        <Heart
                                                            size={18}
                                                            fill={isLiked ? "currentColor" : "none"}
                                                        />
                                                    </button>
                                                </div>

                                                {/* Actions */}
                                                <div className="w-10 flex justify-end">
                                                    {track.isCloudOnly ? (
                                                        <button
                                                            onClick={e => handleDownloadCloud(e, track)}
                                                            className="text-brand-500 hover:text-brand-400 p-2 rounded-full hover:bg-brand-500/10 transition-colors"
                                                            title="Descargar desde la nube"
                                                            disabled={downloadingCloudIds.has(track.id)}
                                                        >
                                                            {downloadingCloudIds.has(track.id) ? (
                                                                <Loader size={18} className="animate-spin" />
                                                            ) : (
                                                                <CloudDownload size={18} />
                                                            )}
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={e => openContextMenu(e, track.id)}
                                                            className="text-slate-500 hover:text-white p-2 rounded-full hover:bg-slate-800 transition-colors opacity-0 group-hover:opacity-100"
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

            {/* Create Playlist Modal */}
            <CreatePlaylistModal
                isOpen={showCreateModal}
                onClose={() => setShowCreateModal(false)}
                onCreated={handleCreatePlaylist}
            />

            {/* Album Detail Modal */}
            <AlbumDetailModal
                isOpen={albumModal.open}
                onClose={() => setAlbumModal(prev => ({ ...prev, open: false }))}
                albumName={albumModal.album}
                artistName={albumModal.artist}
                coverUrl={albumModal.cover}
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

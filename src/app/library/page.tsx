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
    isTrackLiked,
} from "@/lib/db";
import { usePlayer } from "@/context/PlayerContext";
import { useSearchParams } from "next/navigation";
import CreatePlaylistModal from "@/components/CreatePlaylistModal";
import AlbumDetailModal from "@/components/AlbumDetailModal";
import PlaylistDetailModal from "@/components/PlaylistDetailModal";

function LibraryContent() {
    const searchParams = useSearchParams();
    const tab = searchParams.get("tab");
    const playlistIdParam = searchParams.get("playlist");

    const [tracks, setTracks] = useState<SavedTrack[]>([]);
    const [playlists, setPlaylists] = useState<Playlist[]>([]);
    const [query, setQuery] = useState("");
    const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
    const [activeTab, setActiveTab] = useState<"all" | "likes" | "playlists">("all");
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [contextMenuTrackId, setContextMenuTrackId] = useState<string | null>(null);
    const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });

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
        return pls;
    };

    useEffect(() => {
        loadLibrary().then((pls) => {
            // Auto-open playlist if ID is in the URL
            if (playlistIdParam && pls.length > 0) {
                const match = pls.find(p => p.id === playlistIdParam);
                if (match) {
                    setSelectedPlaylist(match);
                }
            }
        });
        if (tab === "likes") setActiveTab("likes");
        else if (tab === "playlists") setActiveTab("playlists");
    }, [tab, playlistIdParam]);

    // Close context menu on click outside
    useEffect(() => {
        const handler = () => setContextMenuTrackId(null);
        window.addEventListener("click", handler);
        return () => window.removeEventListener("click", handler);
    }, []);

    const handlePlay = (track: SavedTrack) => {
        const list = activeTab === "likes" ? likedTracks : filteredTracks;
        playTrack(track, list);
    };

    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (confirm("¿Eliminar esta canción del almacenamiento offline?")) {
            await removeTrackFromDB(id);
            loadLibrary();
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

    const filteredTracks = tracks.filter(
        t =>
            t.title.toLowerCase().includes(query.toLowerCase()) ||
            t.artist.toLowerCase().includes(query.toLowerCase())
    );

    const likedTracks = tracks.filter(t => likedIds.has(t.id));
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
                                className="bg-brand-500 hover:bg-brand-600 text-white px-8 py-3 rounded-full font-bold transition-all shadow-lg"
                            >
                                <Plus size={18} className="inline mr-2" />
                                Crear Playlist
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
                            {/* Create New Card */}
                            <button
                                onClick={() => setShowCreateModal(true)}
                                className="aspect-square rounded-2xl border-2 border-dashed border-slate-700 hover:border-brand-500 flex flex-col items-center justify-center gap-3 text-slate-500 hover:text-brand-500 transition-all group"
                            >
                                <div className="w-14 h-14 rounded-full bg-slate-800 group-hover:bg-brand-500/20 flex items-center justify-center transition-colors">
                                    <Plus size={28} />
                                </div>
                                <span className="text-sm font-semibold">Nueva Playlist</span>
                            </button>

                            {playlists.map(pl => {
                                const coverBlobUrl = pl.coverBlob
                                    ? URL.createObjectURL(pl.coverBlob)
                                    : null;
                                return (
                                    <div
                                        key={pl.id}
                                        onClick={() => setSelectedPlaylist(pl)}
                                        className="bg-slate-800/40 backdrop-blur-sm rounded-2xl p-4 hover:bg-slate-800/70 transition-all group cursor-pointer flex flex-col card-glow"
                                    >
                                        <div className="aspect-square rounded-xl overflow-hidden mb-3 shadow-lg bg-slate-800">
                                            {coverBlobUrl ? (
                                                <img
                                                    src={coverBlobUrl}
                                                    alt={pl.name}
                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                                />
                                            ) : (
                                                <div className="w-full h-full bg-gradient-to-br from-brand-500/30 to-purple-500/30 flex items-center justify-center">
                                                    <ListMusic
                                                        size={48}
                                                        className="text-slate-500"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                        <h3 className="font-bold text-white text-sm truncate">
                                            {pl.name}
                                        </h3>
                                        <p className="text-xs text-slate-400 mt-0.5">
                                            {pl.trackIds.length} cancion
                                            {pl.trackIds.length !== 1 ? "es" : ""}
                                        </p>
                                        {pl.description && (
                                            <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                                                {pl.description}
                                            </p>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>
            )}

            {/* Tracks Tab (All or Likes) */}
            {activeTab !== "playlists" && (
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
                            <div className="text-center py-20 bg-slate-900/40 rounded-3xl border border-slate-800">
                                {activeTab === "likes" ? (
                                    <>
                                        <Heart
                                            size={48}
                                            className="mx-auto text-slate-600 mb-4"
                                        />
                                        <h3 className="text-xl font-medium text-slate-400">
                                            No tienes canciones favoritas
                                        </h3>
                                        <p className="text-slate-500">
                                            Dale ❤️ a las canciones que más te gusten.
                                        </p>
                                    </>
                                ) : (
                                    <>
                                        <Music
                                            size={48}
                                            className="mx-auto text-slate-600 mb-4"
                                        />
                                        <h3 className="text-xl font-medium text-slate-400">
                                            No hay canciones guardadas aún
                                        </h3>
                                        <p className="text-slate-500">
                                            Usa el buscador para descargar música a tu dispositivo.
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
                                                {isCurrent && !isPlaying && (
                                                    <Play
                                                        size={16}
                                                        fill="currentColor"
                                                        className="text-brand-500 hidden group-hover:block"
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
                                                <button
                                                    onClick={e => openContextMenu(e, track.id)}
                                                    className="text-slate-500 hover:text-white p-2 rounded-full hover:bg-slate-800 transition-colors opacity-0 group-hover:opacity-100"
                                                    title="Más opciones"
                                                >
                                                    <MoreHorizontal size={18} />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </>
                        )}
                    </div>
                </>
            )}

            {/* Context Menu */}
            {contextMenuTrackId && (
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
                            handleDelete(e, contextMenuTrackId!);
                            setContextMenuTrackId(null);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-2"
                    >
                        <Trash2 size={14} />
                        Eliminar descarga
                    </button>
                </div>
            )}

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
        </main>
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

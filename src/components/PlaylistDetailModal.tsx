"use client";

import { useEffect, useState } from "react";
import {
    X, Play, Heart, Trash2, Music, Clock, MoreHorizontal, Shuffle, Pause, ListMusic, Loader
} from "lucide-react";
import {
    getTrackFromDB,
    SavedTrack,
    Playlist,
    removeTrackFromPlaylist,
    toggleLike,
    isTrackLiked,
    deletePlaylist,
} from "@/lib/db";
import { usePlayer } from "@/context/PlayerContext";

interface PlaylistDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    playlist: Playlist | null;
    onUpdated: () => void;
}

export default function PlaylistDetailModal({
    isOpen,
    onClose,
    playlist,
    onUpdated,
}: PlaylistDetailModalProps) {
    const [tracks, setTracks] = useState<SavedTrack[]>([]);
    const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const { playTrack, currentTrack, isPlaying, togglePlay, isLoading } = usePlayer();

    useEffect(() => {
        if (!isOpen || !playlist) {
            setTracks([]);
            setLoading(true);
            return;
        }

        const loadTracks = async () => {
            setLoading(true);
            const loaded: SavedTrack[] = [];
            const likes = new Set<string>();

            for (const id of playlist.trackIds) {
                const track = await getTrackFromDB(id);
                if (track) {
                    loaded.push(track);
                    const liked = await isTrackLiked(id);
                    if (liked) likes.add(id);
                }
            }

            setTracks(loaded);
            setLikedIds(likes);
            setLoading(false);
        };

        loadTracks();
    }, [isOpen, playlist]);

    if (!isOpen || !playlist) return null;

    const handlePlayAll = () => {
        if (tracks.length > 0) {
            playTrack(tracks[0], tracks);
        }
    };

    const handleShuffle = () => {
        if (tracks.length > 0) {
            const shuffled = [...tracks].sort(() => Math.random() - 0.5);
            playTrack(shuffled[0], shuffled);
        }
    };

    const handlePlayTrack = (track: SavedTrack) => {
        playTrack(track, tracks);
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

    const handleRemoveTrack = async (e: React.MouseEvent, trackId: string) => {
        e.stopPropagation();
        if (confirm("¿Quitar esta canción de la playlist?")) {
            await removeTrackFromPlaylist(playlist.id, trackId);
            setTracks(prev => prev.filter(t => t.id !== trackId));
            onUpdated();
        }
    };

    const handleDeletePlaylist = async () => {
        if (confirm(`¿Eliminar la playlist "${playlist.name}"? Esta acción no se puede deshacer.`)) {
            await deletePlaylist(playlist.id);
            onUpdated();
            onClose();
        }
    };

    const coverUrl = playlist.coverBlob
        ? URL.createObjectURL(playlist.coverBlob)
        : tracks[0]?.coverUrl || null;

    const totalDuration = tracks.length;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-3xl transition-opacity duration-300"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative z-10 w-full max-w-3xl max-h-[85vh] bg-[#060913]/90 backdrop-blur-2xl border border-white/[0.08] shadow-[0_20px_50px_rgba(0,0,0,0.5)] md:rounded-[2rem] flex flex-col overflow-hidden animate-slideIn">
                {/* Header with gradient background */}
                <div className="relative">
                    {/* Background gradient from cover */}
                    <div
                        className="absolute inset-0 opacity-60"
                        style={{
                            background: coverUrl
                                ? `linear-gradient(180deg, rgba(99,102,241,0.2) 0%, rgba(6,9,19,0.95) 100%)`
                                : `linear-gradient(180deg, rgba(99,102,241,0.15) 0%, rgba(6,9,19,0.95) 100%)`,
                        }}
                    />

                    {/* Close button */}
                    <button
                        onClick={onClose}
                        className="absolute top-5 right-5 z-20 p-2.5 rounded-full bg-white/5 hover:bg-white/15 backdrop-blur-md border border-white/10 text-white/70 hover:text-white transition-all shadow-lg hover:shadow-[0_0_15px_rgba(255,255,255,0.1)] active:scale-90 outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
                        title="Cerrar modal"
                    >
                        <X size={20} strokeWidth={2.5} />
                    </button>

                    {/* Playlist info */}
                    <div className="relative z-10 flex flex-col md:flex-row items-center md:items-end gap-6 px-8 pt-10 pb-6">
                        {/* Cover */}
                        <div className="w-40 h-40 md:w-48 md:h-48 rounded-[2rem] overflow-hidden shadow-[0_15px_40px_rgba(0,0,0,0.5)] flex-shrink-0 bg-slate-800 border border-white/[0.08] group relative">
                            {coverUrl ? (
                                <img
                                    src={coverUrl}
                                    alt={playlist.name}
                                    className="w-full h-full object-cover transform transition-transform duration-700 ease-out group-hover:scale-110"
                                />
                            ) : (
                                <div className="w-full h-full bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center transform transition-transform duration-700 ease-out group-hover:scale-105">
                                    <ListMusic size={60} className="text-slate-600 drop-shadow-lg" strokeWidth={1} />
                                </div>
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0 pb-2 text-center md:text-left flex flex-col items-center md:items-start">
                            <p className="text-xs text-brand-400 font-black uppercase tracking-[0.25em] mb-2 drop-shadow-sm">
                                Playlist
                            </p>
                            <h2 className="text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-300 truncate leading-tight w-full drop-shadow-md pb-1">
                                {playlist.name}
                            </h2>
                            {playlist.description && (
                                <p className="text-[15px] font-medium text-slate-400 mt-2 line-clamp-2 max-w-lg leading-relaxed mix-blend-plus-lighter">
                                    {playlist.description}
                                </p>
                            )}
                            <div className="flex items-center gap-2.5 mt-4 text-[13px] font-bold text-slate-400">
                                <span className="bg-white/10 px-2.5 py-1 rounded-md text-white backdrop-blur-sm shadow-inner">{tracks.length} canci{tracks.length !== 1 ? "ones" : "ón"}</span>
                                <span className="text-slate-600">•</span>
                                <span className="uppercase tracking-wide px-1">Creada {new Date(playlist.createdAt).toLocaleDateString("es")}</span>
                            </div>
                        </div>
                    </div>

                    {/* Action buttons */}
                    <div className="relative z-10 px-8 pb-6 flex items-center justify-center md:justify-start gap-4">
                        <button
                            onClick={handlePlayAll}
                            disabled={tracks.length === 0}
                            className="bg-brand-500 hover:bg-brand-400 text-white px-8 py-3.5 rounded-full font-bold flex items-center gap-2 transition-all duration-300 hover:scale-105 active:scale-95 shadow-[0_8px_25px_rgba(99,102,241,0.4)] hover:shadow-[0_12px_30px_rgba(99,102,241,0.6)] disabled:opacity-40 disabled:hover:scale-100 disabled:hover:shadow-none min-w-[150px] outline-none focus-visible:ring-4 focus-visible:ring-brand-400/50"
                        >
                            <Play size={20} fill="currentColor" /> Reproducir
                        </button>
                        <button
                            onClick={handleShuffle}
                            disabled={tracks.length === 0}
                            className="bg-white/[0.05] hover:bg-white/[0.1] backdrop-blur-md border border-white/[0.1] text-white px-6 py-3.5 rounded-full font-bold flex items-center gap-2.5 transition-all duration-300 hover:scale-105 active:scale-95 disabled:opacity-40 outline-none focus-visible:ring-4 focus-visible:ring-white/20"
                        >
                            <Shuffle size={18} strokeWidth={2.5} /> <span className="hidden sm:inline">Aleatorio</span>
                        </button>
                        <div className="flex-1 hidden md:block" />
                        <button
                            onClick={handleDeletePlaylist}
                            className="p-3.5 rounded-full text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all duration-300 active:scale-90 outline-none focus-visible:ring-4 focus-visible:ring-red-400/50"
                            title="Eliminar playlist"
                        >
                            <Trash2 size={20} />
                        </button>
                    </div>
                </div>

                {/* Track List */}
                <div className="flex-1 overflow-y-auto px-3 pb-4">
                    {loading ? (
                        <div className="flex items-center justify-center py-16">
                            <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
                        </div>
                    ) : tracks.length === 0 ? (
                        <div className="text-center py-16">
                            <Music size={48} className="mx-auto text-slate-600 mb-4" />
                            <h3 className="text-lg font-semibold text-slate-400 mb-2">
                                Playlist vacía
                            </h3>
                            <p className="text-slate-500 text-sm">
                                Agrega canciones desde tu biblioteca usando el menú de opciones (⋯)
                            </p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-1.5 pb-6">
                            {tracks.map((track, idx) => {
                                const isCurrent = currentTrack?.id === track.id;
                                const isLiked = likedIds.has(track.id);

                                return (
                                    <div
                                        key={track.id}
                                        onClick={() => handlePlayTrack(track)}
                                        className={`group flex items-center gap-4 px-4 py-3 rounded-2xl transition-all duration-300 cursor-pointer ${isCurrent
                                            ? "bg-brand-500/10 shadow-[0_4px_20px_-5px_rgba(99,102,241,0.2)]"
                                            : "hover:bg-white/[0.06] hover:shadow-md"
                                            }`}
                                    >
                                        {/* Track number */}
                                        <div className="w-8 text-center flex-shrink-0">
                                            {isCurrent && isLoading ? (
                                                <div className="w-full flex justify-center">
                                                    <Loader size={16} className="text-brand-400 animate-spin" strokeWidth={2.5} />
                                                </div>
                                            ) : isCurrent && isPlaying ? (
                                                <div className="w-full flex justify-center">
                                                    <Music size={16} className="text-brand-500 animate-[bounce_1s_infinite]" strokeWidth={2.5} />
                                                </div>
                                            ) : (
                                                <div className="relative w-full h-full flex items-center justify-center">
                                                    <span className={`text-[13px] font-bold ${isCurrent ? "text-brand-400" : "text-slate-500"} group-hover:opacity-0 transition-opacity`}>
                                                        {idx + 1}
                                                    </span>
                                                    <Play
                                                        size={16}
                                                        fill="currentColor"
                                                        className="text-white absolute opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-md"
                                                    />
                                                </div>
                                            )}
                                        </div>

                                        {/* Cover */}
                                        <div className="relative w-11 h-11 flex-shrink-0">
                                            <img
                                                src={track.coverUrl || "/placeholder.png"}
                                                alt=""
                                                className={`w-full h-full rounded-[10px] object-cover shadow-[0_4px_10px_rgba(0,0,0,0.3)] transition-all duration-300 ${isCurrent ? "ring-2 ring-brand-500 ring-offset-2 ring-offset-[#0f1629]" : "group-hover:scale-105"}`}
                                            />
                                        </div>

                                        {/* Track info */}
                                        <div className="flex-1 min-w-0 pr-4">
                                            <p className={`text-[15px] font-bold truncate transition-colors drop-shadow-sm ${isCurrent ? "text-brand-400" : "text-white group-hover:text-brand-200"}`}>
                                                {track.title}
                                            </p>
                                            <p className="text-[13px] font-medium text-slate-400 truncate mt-0.5">
                                                {track.artist}
                                            </p>
                                        </div>

                                        {/* Like */}
                                        <button
                                            onClick={e => handleToggleLike(e, track.id)}
                                            className={`p-2.5 rounded-full transition-all duration-300 flex-shrink-0 active:scale-90 outline-none focus-visible:ring-4 focus-visible:ring-pink-500/40 ${isLiked
                                                ? "text-pink-500 bg-pink-500/10 hover:bg-pink-500/20"
                                                : "text-slate-500 hover:text-pink-400 hover:bg-white/10 opacity-0 group-hover:opacity-100"
                                                }`}
                                            title={isLiked ? "Quitar me gusta" : "Me gusta"}
                                        >
                                            <Heart size={18} fill={isLiked ? "currentColor" : "none"} />
                                        </button>

                                        {/* Remove from playlist */}
                                        <button
                                            onClick={e => handleRemoveTrack(e, track.id)}
                                            className="p-2.5 rounded-full text-slate-500 opacity-0 group-hover:opacity-100 hover:text-red-400 hover:bg-red-500/10 transition-all duration-300 active:scale-90 flex-shrink-0 outline-none focus-visible:ring-4 focus-visible:ring-red-400/50"
                                            title="Quitar de playlist"
                                        >
                                            <Trash2 size={18} />
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

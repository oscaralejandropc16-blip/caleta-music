"use client";

import { useEffect, useState } from "react";
import {
    X, Play, Heart, Trash2, Music, Clock, MoreHorizontal, Shuffle, Pause,
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
    const { playTrack, currentTrack, isPlaying, togglePlay } = usePlayer();

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
                className="absolute inset-0 bg-black/70 backdrop-blur-md"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative z-10 w-full max-w-2xl max-h-[85vh] bg-[#0f1629] border border-white/[0.08] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-modal-in">
                {/* Header with gradient background */}
                <div className="relative">
                    {/* Background gradient from cover */}
                    <div
                        className="absolute inset-0 opacity-40"
                        style={{
                            background: coverUrl
                                ? `linear-gradient(180deg, rgba(99,102,241,0.3) 0%, transparent 100%)`
                                : `linear-gradient(180deg, rgba(99,102,241,0.2) 0%, transparent 100%)`,
                        }}
                    />

                    {/* Close button */}
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 z-20 p-2 rounded-full bg-black/30 hover:bg-black/50 text-white/70 hover:text-white transition-all"
                    >
                        <X size={20} />
                    </button>

                    {/* Playlist info */}
                    <div className="relative z-10 flex items-end gap-5 px-6 pt-8 pb-6">
                        {/* Cover */}
                        <div className="w-32 h-32 rounded-2xl overflow-hidden shadow-2xl flex-shrink-0 bg-slate-800 border border-white/[0.05]">
                            {coverUrl ? (
                                <img
                                    src={coverUrl}
                                    alt={playlist.name}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <div className="w-full h-full bg-gradient-to-br from-brand-500/30 to-purple-500/30 flex items-center justify-center">
                                    <Music size={40} className="text-slate-500" />
                                </div>
                            )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0 pb-1">
                            <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-1">
                                Playlist
                            </p>
                            <h2 className="text-3xl font-black text-white truncate leading-tight">
                                {playlist.name}
                            </h2>
                            {playlist.description && (
                                <p className="text-sm text-slate-400 mt-1 line-clamp-2">
                                    {playlist.description}
                                </p>
                            )}
                            <div className="flex items-center gap-3 mt-3 text-sm text-slate-400">
                                <span>{tracks.length} cancion{tracks.length !== 1 ? "es" : ""}</span>
                                <span className="text-slate-600">•</span>
                                <span>Creada {new Date(playlist.createdAt).toLocaleDateString("es")}</span>
                            </div>
                        </div>
                    </div>

                    {/* Action buttons */}
                    <div className="relative z-10 px-6 pb-4 flex items-center gap-3">
                        <button
                            onClick={handlePlayAll}
                            disabled={tracks.length === 0}
                            className="bg-brand-500 hover:bg-brand-600 text-white px-6 py-2.5 rounded-full font-bold flex items-center gap-2 transition-all hover:scale-105 shadow-lg shadow-brand-500/20 disabled:opacity-40 disabled:hover:scale-100"
                        >
                            <Play size={18} fill="currentColor" /> Reproducir
                        </button>
                        <button
                            onClick={handleShuffle}
                            disabled={tracks.length === 0}
                            className="bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-white px-5 py-2.5 rounded-full font-bold flex items-center gap-2 transition-all disabled:opacity-40"
                        >
                            <Shuffle size={16} /> Aleatorio
                        </button>
                        <div className="flex-1" />
                        <button
                            onClick={handleDeletePlaylist}
                            className="p-2.5 rounded-full text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                            title="Eliminar playlist"
                        >
                            <Trash2 size={18} />
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
                        <div className="flex flex-col gap-1">
                            {tracks.map((track, idx) => {
                                const isCurrent = currentTrack?.id === track.id;
                                const isLiked = likedIds.has(track.id);

                                return (
                                    <div
                                        key={track.id}
                                        onClick={() => handlePlayTrack(track)}
                                        className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all cursor-pointer ${isCurrent
                                                ? "bg-brand-500/10 border border-brand-500/20"
                                                : "hover:bg-white/[0.04]"
                                            }`}
                                    >
                                        {/* Track number */}
                                        <div className="w-7 text-center flex-shrink-0">
                                            {isCurrent && isPlaying ? (
                                                <Music size={14} className="text-brand-500 animate-pulse mx-auto" />
                                            ) : (
                                                <>
                                                    <span className="text-sm text-slate-500 group-hover:hidden">
                                                        {idx + 1}
                                                    </span>
                                                    <Play
                                                        size={14}
                                                        fill="currentColor"
                                                        className="text-white hidden group-hover:block mx-auto"
                                                    />
                                                </>
                                            )}
                                        </div>

                                        {/* Cover */}
                                        <img
                                            src={track.coverUrl || "/placeholder.png"}
                                            alt=""
                                            className={`w-10 h-10 rounded-lg object-cover flex-shrink-0 shadow-md ${isCurrent ? "ring-2 ring-brand-500 ring-offset-1 ring-offset-[#0f1629]" : ""
                                                }`}
                                        />

                                        {/* Track info */}
                                        <div className="flex-1 min-w-0">
                                            <p className={`text-sm font-semibold truncate ${isCurrent ? "text-brand-400" : "text-white"
                                                }`}>
                                                {track.title}
                                            </p>
                                            <p className="text-xs text-slate-400 truncate">
                                                {track.artist}
                                            </p>
                                        </div>

                                        {/* Like */}
                                        <button
                                            onClick={e => handleToggleLike(e, track.id)}
                                            className={`p-1.5 rounded-full transition-all flex-shrink-0 ${isLiked
                                                    ? "text-pink-500"
                                                    : "text-slate-600 opacity-0 group-hover:opacity-100 hover:text-pink-500"
                                                }`}
                                        >
                                            <Heart size={15} fill={isLiked ? "currentColor" : "none"} />
                                        </button>

                                        {/* Remove from playlist */}
                                        <button
                                            onClick={e => handleRemoveTrack(e, track.id)}
                                            className="p-1.5 rounded-full text-slate-600 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all flex-shrink-0"
                                            title="Quitar de playlist"
                                        >
                                            <Trash2 size={14} />
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

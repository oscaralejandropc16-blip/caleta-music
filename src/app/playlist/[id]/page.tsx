"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
    Play, Heart, Trash2, Music, Shuffle, Pause, ListMusic, Loader,
    ChevronLeft, Clock, MoreHorizontal
} from "lucide-react";
import {
    getPlaylist,
    getTrackFromDB,
    SavedTrack,
    Playlist,
    removeTrackFromPlaylist,
    toggleLike,
    isTrackLiked,
    deletePlaylist,
} from "@/lib/db";
import { usePlayer } from "@/context/PlayerContext";

export default function PlaylistPage() {
    const params = useParams();
    const router = useRouter();
    const playlistId = params.id as string;

    const [playlist, setPlaylist] = useState<Playlist | null>(null);
    const [tracks, setTracks] = useState<SavedTrack[]>([]);
    const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const { playTrack, currentTrack, isPlaying, togglePlay, isLoading: playerLoading } = usePlayer();

    const loadPlaylist = useCallback(async () => {
        setLoading(true);
        const pl = await getPlaylist(playlistId);
        if (!pl) {
            setNotFound(true);
            setLoading(false);
            return;
        }
        setPlaylist(pl);

        const loaded: SavedTrack[] = [];
        const likes = new Set<string>();

        for (const id of pl.trackIds) {
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
    }, [playlistId]);

    useEffect(() => {
        loadPlaylist();
    }, [loadPlaylist]);

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
            await removeTrackFromPlaylist(playlistId, trackId);
            setTracks(prev => prev.filter(t => t.id !== trackId));
        }
    };

    const handleDeletePlaylist = async () => {
        if (!playlist) return;
        if (confirm(`¿Eliminar la playlist "${playlist.name}"? Esta acción no se puede deshacer.`)) {
            await deletePlaylist(playlist.id);
            router.push("/library?tab=playlists");
        }
    };

    // Loading state
    if (loading) {
        return (
            <main className="p-4 md:p-8 max-w-5xl mx-auto">
                <div className="flex items-center justify-center py-32">
                    <div className="w-12 h-12 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
                </div>
            </main>
        );
    }

    // Not found state
    if (notFound || !playlist) {
        return (
            <main className="p-4 md:p-8 max-w-5xl mx-auto">
                <div className="flex flex-col items-center justify-center py-32">
                    <div className="w-24 h-24 rounded-3xl bg-slate-800/50 border border-slate-700/30 flex items-center justify-center mb-6">
                        <ListMusic size={44} className="text-slate-500" strokeWidth={1.5} />
                    </div>
                    <h2 className="text-2xl font-black text-white mb-2">Playlist no encontrada</h2>
                    <p className="text-slate-400 mb-6">Esta playlist no existe o fue eliminada.</p>
                    <button
                        onClick={() => router.push("/library?tab=playlists")}
                        className="flex items-center gap-2 px-6 py-3 rounded-xl bg-brand-500 hover:bg-brand-400 text-white font-bold transition-all active:scale-95"
                    >
                        <ChevronLeft size={18} /> Volver a Biblioteca
                    </button>
                </div>
            </main>
        );
    }

    const coverUrl = playlist.coverBlob
        ? URL.createObjectURL(playlist.coverBlob)
        : tracks[0]?.coverUrl || null;

    return (
        <main className="max-w-5xl mx-auto pb-32">

            {/* ═══ Hero Header ═══ */}
            <div className="relative overflow-hidden">
                {/* Background blur from cover */}
                {coverUrl && (
                    <div className="absolute inset-0 overflow-hidden">
                        <img
                            src={coverUrl}
                            alt=""
                            className="w-full h-full object-cover scale-150 blur-[80px] opacity-30"
                        />
                        <div className="absolute inset-0 bg-gradient-to-b from-[#0a0f1e]/40 via-[#0a0f1e]/80 to-[#0a0f1e]" />
                    </div>
                )}
                {!coverUrl && (
                    <div className="absolute inset-0">
                        <div className="absolute inset-0 bg-gradient-to-b from-brand-500/10 via-[#0a0f1e]/80 to-[#0a0f1e]" />
                    </div>
                )}

                <div className="relative z-10 px-4 md:px-8 pt-8 pb-6">
                    {/* Back button */}
                    <button
                        onClick={() => router.back()}
                        className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors mb-8 font-medium group"
                    >
                        <ChevronLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
                        Atrás
                    </button>

                    {/* Playlist Info */}
                    <div className="flex flex-col md:flex-row items-center md:items-end gap-6 md:gap-8">
                        {/* Cover */}
                        <div className="w-52 h-52 md:w-60 md:h-60 rounded-2xl overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.5)] flex-shrink-0 bg-slate-800 border border-white/[0.06] group">
                            {coverUrl ? (
                                <img
                                    src={coverUrl}
                                    alt={playlist.name}
                                    className="w-full h-full object-cover transform transition-transform duration-700 ease-out group-hover:scale-110"
                                />
                            ) : (
                                <div className="w-full h-full bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center">
                                    <ListMusic size={72} className="text-slate-600 drop-shadow-lg" strokeWidth={1} />
                                </div>
                            )}
                        </div>

                        {/* Text */}
                        <div className="flex-1 min-w-0 text-center md:text-left pb-2">
                            <p className="text-xs text-brand-400 font-black uppercase tracking-[0.25em] mb-3 drop-shadow-sm">
                                Playlist
                            </p>
                            <h1 className="text-4xl md:text-6xl font-black text-white leading-tight mb-3 drop-shadow-lg">
                                {playlist.name}
                            </h1>
                            {playlist.description && (
                                <p className="text-base font-medium text-slate-400 mb-4 max-w-xl leading-relaxed">
                                    {playlist.description}
                                </p>
                            )}
                            <div className="flex items-center justify-center md:justify-start gap-3 text-sm font-semibold text-slate-400">
                                <span className="bg-white/10 px-3 py-1 rounded-lg text-white text-xs font-bold tracking-wide">
                                    {tracks.length} canci{tracks.length !== 1 ? "ones" : "ón"}
                                </span>
                                <span className="text-slate-600">•</span>
                                <span className="text-xs tracking-wide">
                                    Creada {new Date(playlist.createdAt).toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" })}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center justify-center md:justify-start gap-4 mt-8">
                        <button
                            onClick={handlePlayAll}
                            disabled={tracks.length === 0}
                            className="bg-brand-500 hover:bg-brand-400 text-white px-8 py-3.5 rounded-full font-bold flex items-center gap-2.5 transition-all duration-300 hover:scale-105 active:scale-95 shadow-[0_8px_25px_rgba(99,102,241,0.4)] hover:shadow-[0_12px_30px_rgba(99,102,241,0.6)] disabled:opacity-40 disabled:hover:scale-100 outline-none focus-visible:ring-4 focus-visible:ring-brand-400/50"
                        >
                            <Play size={20} fill="currentColor" /> Reproducir
                        </button>
                        <button
                            onClick={handleShuffle}
                            disabled={tracks.length === 0}
                            className="bg-white/[0.06] hover:bg-white/[0.12] backdrop-blur-md border border-white/[0.08] text-white px-6 py-3.5 rounded-full font-bold flex items-center gap-2.5 transition-all duration-300 hover:scale-105 active:scale-95 disabled:opacity-40 outline-none focus-visible:ring-4 focus-visible:ring-white/20"
                        >
                            <Shuffle size={18} strokeWidth={2.5} /> Aleatorio
                        </button>
                        <div className="flex-1" />
                        <button
                            onClick={handleDeletePlaylist}
                            className="p-3.5 rounded-full text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all duration-300 active:scale-90 outline-none focus-visible:ring-4 focus-visible:ring-red-400/50"
                            title="Eliminar playlist"
                        >
                            <Trash2 size={20} />
                        </button>
                    </div>
                </div>
            </div>

            {/* ═══ Track List ═══ */}
            <div className="px-4 md:px-8 mt-4">
                {tracks.length === 0 ? (
                    <div className="text-center py-20">
                        <div className="w-20 h-20 rounded-2xl bg-slate-800/50 border border-slate-700/20 flex items-center justify-center mx-auto mb-5">
                            <Music size={36} className="text-slate-600" />
                        </div>
                        <h3 className="text-xl font-bold text-white mb-2">Playlist vacía</h3>
                        <p className="text-slate-500 text-sm max-w-sm mx-auto">
                            Agrega canciones desde tu biblioteca usando el menú de opciones (⋯) en cualquier canción.
                        </p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-1">
                        {/* Table header */}
                        <div className="flex items-center gap-4 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-white/[0.05] mb-1">
                            <div className="w-8 text-center">#</div>
                            <div className="w-11 flex-shrink-0" />
                            <div className="flex-1">Título</div>
                            <div className="w-20 hidden sm:block" />
                            <div className="w-10" />
                            <div className="w-10" />
                        </div>

                        {tracks.map((track, idx) => {
                            const isCurrent = currentTrack?.id === track.id;
                            const isLiked = likedIds.has(track.id);

                            return (
                                <div
                                    key={track.id}
                                    onClick={() => handlePlayTrack(track)}
                                    className={`group flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-300 cursor-pointer ${isCurrent
                                        ? "bg-brand-500/10"
                                        : "hover:bg-white/[0.04]"
                                        }`}
                                >
                                    {/* Track number */}
                                    <div className="w-8 text-center flex-shrink-0 relative">
                                        {isCurrent && playerLoading ? (
                                            <Loader size={16} className="text-brand-400 animate-spin mx-auto" strokeWidth={2.5} />
                                        ) : isCurrent && isPlaying ? (
                                            <Music size={16} className="text-brand-500 animate-[bounce_1s_infinite] mx-auto" strokeWidth={2.5} />
                                        ) : (
                                            <>
                                                <span className={`text-[13px] font-bold ${isCurrent ? "text-brand-400" : "text-slate-500"} group-hover:opacity-0 transition-opacity`}>
                                                    {idx + 1}
                                                </span>
                                                <Play
                                                    size={14}
                                                    fill="currentColor"
                                                    className="text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity"
                                                />
                                            </>
                                        )}
                                    </div>

                                    {/* Cover */}
                                    <div className="relative w-11 h-11 flex-shrink-0">
                                        <img
                                            src={track.coverUrl || "/placeholder.png"}
                                            alt=""
                                            className={`w-full h-full rounded-lg object-cover shadow-[0_4px_10px_rgba(0,0,0,0.3)] transition-all duration-300 ${isCurrent ? "ring-2 ring-brand-500 ring-offset-2 ring-offset-[#0a0f1e]" : ""}`}
                                        />
                                    </div>

                                    {/* Track info */}
                                    <div className="flex-1 min-w-0 pr-2">
                                        <p className={`text-[15px] font-bold truncate transition-colors ${isCurrent ? "text-brand-400" : "text-white group-hover:text-brand-200"}`}>
                                            {track.title}
                                        </p>
                                        <p className="text-[13px] font-medium text-slate-400 truncate mt-0.5">
                                            {track.artist}
                                        </p>
                                    </div>

                                    {/* Like */}
                                    <button
                                        onClick={e => handleToggleLike(e, track.id)}
                                        className={`p-2.5 rounded-full transition-all duration-300 flex-shrink-0 active:scale-90 outline-none ${isLiked
                                            ? "text-pink-500 bg-pink-500/10 hover:bg-pink-500/20"
                                            : "text-slate-500 hover:text-pink-400 hover:bg-white/10 opacity-0 group-hover:opacity-100"
                                            }`}
                                        title={isLiked ? "Quitar me gusta" : "Me gusta"}
                                    >
                                        <Heart size={18} fill={isLiked ? "currentColor" : "none"} />
                                    </button>

                                    {/* Remove */}
                                    <button
                                        onClick={e => handleRemoveTrack(e, track.id)}
                                        className="p-2.5 rounded-full text-slate-500 opacity-0 group-hover:opacity-100 hover:text-red-400 hover:bg-red-500/10 transition-all duration-300 active:scale-90 flex-shrink-0 outline-none"
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
        </main>
    );
}

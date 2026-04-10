"use client";

import { useState, useEffect } from "react";
import { X, Plus, Music } from "lucide-react";
import { Playlist, getAllPlaylists, addTrackToPlaylist, SavedTrack, saveTrackToDB } from "@/lib/db";
import toast from "react-hot-toast";

interface AddToPlaylistModalProps {
    isOpen: boolean;
    onClose: () => void;
    track: SavedTrack | null;
    onCreateNew?: () => void;
    onSelectPlaylist?: (playlist: Playlist, track: SavedTrack) => void;
}

export default function AddToPlaylistModal({ isOpen, onClose, track, onCreateNew, onSelectPlaylist }: AddToPlaylistModalProps) {
    const [playlists, setPlaylists] = useState<Playlist[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (isOpen) {
            loadPlaylists();
        }
    }, [isOpen]);

    const loadPlaylists = async () => {
        setLoading(true);
        try {
            const data = await getAllPlaylists();
            setPlaylists(data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleAddToPlaylist = async (playlist: Playlist) => {
        if (!track) return;

        if (onSelectPlaylist) {
            onSelectPlaylist(playlist, track);
            return;
        }

        try {
            // First, make sure track is saved in the DB so it can be played later
            await saveTrackToDB({
                ...track,
                downloadedAt: track.downloadedAt || Date.now()
            });

            if (playlist.trackIds.includes(track.id)) {
                toast(`Ya está en "${playlist.name}"`, { icon: "ℹ️" });
            } else {
                await addTrackToPlaylist(playlist.id, track.id);
                toast.success(`Añadida a "${playlist.name}"`);
            }
            onClose();
        } catch (error) {
            console.error("Error adding to playlist:", error);
            toast.error("Error al añadir");
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-4 px-2 pb-6 pt-10">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-[#060913]/60 backdrop-blur-md transition-opacity"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative w-full sm:max-w-md bg-[#0a0f1e]/80 backdrop-blur-2xl border border-white/10 rounded-[28px] shadow-[0_20px_60px_-10px_rgba(0,0,0,0.8)] animate-modal-in flex flex-col max-h-[85vh] sm:max-h-[80vh] overflow-hidden mb-safe">
                {/* Header */}
                <div className="flex-shrink-0 flex items-center justify-between px-6 py-5 border-b border-white/[0.05]">
                    <h2 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400">Añadir a playlist</h2>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors bg-white/[0.03]"
                    >
                        <X size={20} strokeWidth={2.5} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-3 overflow-y-auto custom-scrollbar flex-1">
                    {onCreateNew && (
                        <button
                            onClick={() => {
                                onClose();
                                onCreateNew();
                            }}
                            className="w-full flex items-center gap-4 px-4 py-4 hover:bg-white/[0.04] transition-all duration-300 rounded-[20px] group active:scale-[0.98] border border-transparent hover:border-white/[0.05]"
                        >
                            <div className="w-14 h-14 rounded-[16px] bg-white/[0.02] flex items-center justify-center flex-shrink-0 border border-white/[0.05] group-hover:bg-brand-500/20 group-hover:border-brand-500/40 transition-colors shadow-inner">
                                <Plus size={24} className="text-brand-400 group-hover:scale-110 transition-transform" />
                            </div>
                            <div className="flex-1 text-left">
                                <h3 className="text-base font-bold text-white group-hover:text-brand-300 transition-colors">Nueva playlist</h3>
                                <p className="text-[13px] text-slate-400 mt-0.5 font-medium">Crear una nueva desde cero</p>
                            </div>
                        </button>
                    )}

                    <div className="h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent my-3 mx-4" />

                    {loading ? (
                        <div className="flex justify-center items-center py-10">
                            <div className="w-8 h-8 border-3 border-brand-500 border-t-transparent rounded-full animate-spin shadow-[0_0_15px_rgba(99,102,241,0.5)]" />
                        </div>
                    ) : playlists.length === 0 ? (
                        <div className="text-center py-12 px-6 opacity-80">
                            <div className="w-16 h-16 rounded-[20px] bg-white/[0.02] border border-white/[0.05] mx-auto flex items-center justify-center mb-4">
                                <Music size={32} className="text-slate-500" />
                            </div>
                            <p className="text-slate-400 font-medium text-[15px]">No tienes playlists creadas todavía.</p>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {playlists.map((playlist) => (
                                <button
                                    key={playlist.id}
                                    onClick={() => handleAddToPlaylist(playlist)}
                                    className="w-full relative flex items-center gap-4 px-4 py-3 hover:bg-white/[0.04] transition-all duration-300 rounded-[20px] group active:scale-[0.98] border border-transparent hover:border-white/[0.05] overflow-hidden"
                                >
                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.02] to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 pointer-events-none" />

                                    <div
                                        className="w-14 h-14 rounded-[14px] bg-white/[0.05] flex items-center justify-center flex-shrink-0 shadow-md overflow-hidden relative z-10 group-hover:scale-105 transition-transform"
                                        style={playlist.coverBlob || playlist.coverUrl ? {
                                            backgroundImage: playlist.coverBlob
                                                ? `url(${URL.createObjectURL(playlist.coverBlob)})`
                                                : `url(${playlist.coverUrl})`,
                                            backgroundSize: "cover",
                                            backgroundPosition: "center"
                                        } : {}}
                                    >
                                        {!playlist.coverBlob && !playlist.coverUrl && (
                                            <Music size={24} className="text-slate-500" />
                                        )}
                                    </div>
                                    <div className="flex-1 text-left overflow-hidden z-10">
                                        <h3 className="text-[15px] font-bold text-white truncate group-hover:text-brand-300 transition-colors drop-shadow-sm">{playlist.name}</h3>
                                        <p className="text-[12px] font-medium text-slate-400 mt-0.5">
                                            {playlist.trackIds.length} {playlist.trackIds.length === 1 ? 'canción' : 'canciones'}
                                        </p>
                                    </div>
                                    <div className="px-2 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-x-2 group-hover:translate-x-0 z-10">
                                        <div className="p-1.5 rounded-full bg-brand-500/20 text-brand-400">
                                            <Plus size={18} strokeWidth={2.5} />
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div >
    );
}

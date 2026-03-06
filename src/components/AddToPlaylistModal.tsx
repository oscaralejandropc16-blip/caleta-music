"use client";

import { useState, useEffect } from "react";
import { X, Plus, Music } from "lucide-react";
import { Playlist, getAllPlaylists, addTrackToPlaylist, SavedTrack, saveTrackToDB } from "@/lib/db";
import toast from "react-hot-toast";

interface AddToPlaylistModalProps {
    isOpen: boolean;
    onClose: () => void;
    track: SavedTrack | null;
    onCreateNew?: () => void; // Option to open the CreatePlaylistModal
}

export default function AddToPlaylistModal({ isOpen, onClose, track, onCreateNew }: AddToPlaylistModalProps) {
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

        try {
            // First, make sure track is saved in the DB so it can be played later
            await saveTrackToDB({
                ...track,
                downloadedAt: track.downloadedAt || Date.now()
            });

            if (playlist.trackIds.includes(track.id)) {
                toast(`Ya está en "${playlist.name}"`, {
                    icon: "ℹ️",
                    style: { background: "#1e1e24", color: "#fff", borderColor: "#ffffff10", borderWidth: "1px" }
                });
            } else {
                await addTrackToPlaylist(playlist.id, track.id);
                toast(`Añadida a "${playlist.name}"`, {
                    icon: "🎵",
                    style: { background: "#1e1e24", color: "#fff", borderColor: "#ffffff10", borderWidth: "1px" }
                });
            }
            onClose();
        } catch (error) {
            console.error("Error adding to playlist:", error);
            toast.error("Error al añadir");
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative w-full sm:max-w-md bg-slate-900 sm:border border-slate-700/50 sm:rounded-3xl rounded-t-3xl shadow-2xl animate-modal-in flex flex-col max-h-[85vh] sm:max-h-[80vh] overflow-hidden">
                {/* Header */}
                <div className="flex-shrink-0 flex items-center justify-between px-6 py-5 border-b border-slate-800">
                    <h2 className="text-xl font-bold text-white">Añadir a playlist</h2>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-white p-1.5 rounded-full hover:bg-slate-800 transition-colors"
                    >
                        <X size={22} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-2 overflow-y-auto custom-scrollbar flex-1">
                    {onCreateNew && (
                        <button
                            onClick={() => {
                                onClose();
                                onCreateNew();
                            }}
                            className="w-full flex items-center gap-4 px-4 py-4 hover:bg-slate-800/80 transition-colors rounded-2xl group"
                        >
                            <div className="w-14 h-14 rounded-xl bg-slate-800 flex items-center justify-center flex-shrink-0 border border-slate-700 group-hover:bg-brand-500 group-hover:border-brand-500 transition-colors">
                                <Plus size={24} className="text-slate-400 group-hover:text-white transition-colors" />
                            </div>
                            <div className="flex-1 text-left">
                                <h3 className="text-base font-bold text-white">Nueva playlist</h3>
                                <p className="text-xs text-slate-400 mt-0.5">Crear una nueva</p>
                            </div>
                        </button>
                    )}

                    <div className="h-px bg-slate-800/50 my-2 mx-4" />

                    {loading ? (
                        <div className="flex justify-center items-center py-10">
                            <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : playlists.length === 0 ? (
                        <div className="text-center py-12 px-6 opacity-70">
                            <Music size={48} className="mx-auto text-slate-600 mb-4" />
                            <p className="text-slate-400 text-sm">No tienes playlists creadas todavía.</p>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {playlists.map((playlist) => (
                                <button
                                    key={playlist.id}
                                    onClick={() => handleAddToPlaylist(playlist)}
                                    className="w-full flex items-center gap-4 px-4 py-3 hover:bg-slate-800/80 transition-colors rounded-2xl group"
                                >
                                    <div 
                                        className="w-14 h-14 rounded-xl bg-slate-800 flex items-center justify-center flex-shrink-0 border border-slate-700/50 overflow-hidden"
                                        style={playlist.coverBlob || playlist.coverUrl ? {
                                            backgroundImage: playlist.coverBlob 
                                                ? \`url(\${URL.createObjectURL(playlist.coverBlob)})\`
                                                : \`url(\${playlist.coverUrl})\`,
                                            backgroundSize: "cover",
                                            backgroundPosition: "center"
                                        } : {}}
                                    >
                                        {!playlist.coverBlob && !playlist.coverUrl && (
                                            <Music size={24} className="text-slate-500" />
                                        )}
                                    </div>
                                    <div className="flex-1 text-left overflow-hidden">
                                        <h3 className="text-base font-semibold text-white truncate">{playlist.name}</h3>
                                        <p className="text-xs text-slate-400 mt-0.5">
                                            {playlist.trackIds.length} {playlist.trackIds.length === 1 ? 'canción' : 'canciones'}
                                        </p>
                                    </div>
                                    <div className="px-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Plus size={20} className="text-brand-500" />
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

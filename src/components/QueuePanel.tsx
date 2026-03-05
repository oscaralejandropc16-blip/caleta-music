"use client";

import React from "react";
import { usePlayer } from "@/context/PlayerContext";
import { X, Play, Equal, Trash2 } from "lucide-react";

export default function QueuePanel() {
    const {
        queue,
        currentIndex,
        isQueueVisible,
        toggleQueue,
        playQueueIndex,
        removeFromQueue,
        currentTrack
    } = usePlayer();

    return (
        <div className={`fixed top-0 right-0 bottom-[60px] md:bottom-[90px] w-full md:w-[400px] bg-[#121216] border-l border-white/5 z-40 flex flex-col shadow-2xl transition-transform duration-300 transform ${isQueueVisible ? 'translate-x-0' : 'translate-x-full'}`}>
            {/* Header */}
            <div className="flex items-center justify-between p-4 md:p-6 border-b border-white/5 shrink-0">
                <h2 className="text-white font-bold text-lg">Cola de reproducción</h2>
                <button
                    onClick={toggleQueue}
                    className="p-2 text-neutral-400 hover:text-white transition-colors rounded-full hover:bg-white/5"
                >
                    <X size={20} />
                </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                {queue.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-neutral-500">
                        <p>La cola está vacía</p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-1">
                        {queue.map((track, index) => {
                            const isPlaying = index === currentIndex;

                            return (
                                <div
                                    key={`${track.id}-${index}`}
                                    className={`group flex items-center gap-3 p-2 rounded-md transition-colors ${isPlaying ? 'bg-white/10' : 'hover:bg-white/5'
                                        }`}
                                >
                                    <div
                                        className="relative w-10 h-10 rounded-md overflow-hidden shrink-0 cursor-pointer"
                                        onClick={() => !isPlaying && playQueueIndex(index)}
                                    >
                                        <img
                                            src={track.coverUrl || '/placeholder.png'}
                                            alt={track.title}
                                            className={`w-full h-full object-cover transition-opacity ${!isPlaying && 'group-hover:opacity-50'}`}
                                        />
                                        {isPlaying ? (
                                            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                                                <div className="w-1 h-3 bg-brand-500 rounded-sm mx-[1px] animate-[pulse_1s_ease-in-out_infinite]" />
                                                <div className="w-1 h-4 bg-brand-500 rounded-sm mx-[1px] animate-[pulse_1.2s_ease-in-out_infinite_0.2s]" />
                                                <div className="w-1 h-2 bg-brand-500 rounded-sm mx-[1px] animate-[pulse_0.8s_ease-in-out_infinite_0.4s]" />
                                            </div>
                                        ) : (
                                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100">
                                                <Play size={16} className="text-white ml-1" fill="currentColor" />
                                            </div>
                                        )}
                                    </div>

                                    <div
                                        className="flex flex-col flex-1 min-w-0 cursor-pointer"
                                        onClick={() => !isPlaying && playQueueIndex(index)}
                                    >
                                        <span className={`text-[13px] font-bold truncate ${isPlaying ? 'text-brand-400' : 'text-white'}`}>
                                            {track.title}
                                        </span>
                                        <span className="text-[11px] text-neutral-400 truncate mt-[1px]">
                                            {track.artist}
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={() => removeFromQueue(index)}
                                            className="p-1.5 text-neutral-400 hover:text-brand-500 transition-colors"
                                            title="Quitar de la cola"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                        <div className="p-1.5 text-neutral-500 cursor-grab">
                                            <Equal size={16} />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

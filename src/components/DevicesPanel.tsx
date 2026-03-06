"use client";

import React, { useState, useRef, useCallback } from "react";
import { usePlayer } from "@/context/PlayerContext";
import { useAuth } from "@/context/AuthContext";
import { X, TabletSmartphone, Laptop, MonitorSpeaker, Wifi, Cast, ChevronDown } from "lucide-react";

export default function DevicesPanel() {
    const {
        isDevicesVisible,
        toggleDevices
    } = usePlayer();

    const { user } = useAuth();
    const userName = user?.user_metadata?.username || user?.user_metadata?.name || 'Usuario';
    const phoneName = `Teléfono de ${userName.split(' ')[0]}`;

    const contentRef = useRef<HTMLDivElement>(null);

    // Swipe-down-to-close gesture
    const touchStartY = useRef(0);
    const touchCurrentY = useRef(0);
    const isDragging = useRef(false);
    const [dragOffset, setDragOffset] = useState(0);

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        if (contentRef.current && contentRef.current.scrollTop > 10) return;
        touchStartY.current = e.touches[0].clientY;
        touchCurrentY.current = e.touches[0].clientY;
        isDragging.current = true;
    }, []);

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        if (!isDragging.current) return;
        touchCurrentY.current = e.touches[0].clientY;
        const diff = touchCurrentY.current - touchStartY.current;
        if (diff > 0) setDragOffset(diff);
    }, []);

    const handleTouchEnd = useCallback(() => {
        isDragging.current = false;
        const diff = touchCurrentY.current - touchStartY.current;
        if (diff > 100) {
            setDragOffset(window.innerHeight);
            setTimeout(() => {
                toggleDevices();
                setDragOffset(0);
            }, 200);
        } else {
            setDragOffset(0);
        }
    }, [toggleDevices]);

    return (
        <div
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{
                transform: dragOffset > 0 ? `translateY(${dragOffset}px)` : undefined,
                transition: isDragging.current ? 'none' : 'transform 0.3s ease-out',
                opacity: dragOffset > 0 ? Math.max(1 - dragOffset / 500, 0.5) : 1,
            }}
            className={`fixed inset-x-0 bottom-0 pt-[env(safe-area-inset-top)] md:pt-0 pb-[env(safe-area-inset-bottom)] top-0 md:top-0 md:left-auto md:w-[400px] bg-[#121216] md:border-l border-white/5 z-[100] md:z-40 flex flex-col shadow-2xl transition-transform duration-300 transform ${isDevicesVisible ? 'translate-y-0 md:translate-x-0' : 'translate-y-full md:translate-y-0 md:translate-x-full'}`}>

            {/* Drag handle indicator (Mobile only) */}
            <div className="w-10 h-1.5 bg-white/20 rounded-full mx-auto mt-3 mb-1 md:hidden" />

            {/* Header */}
            <div className="flex items-center justify-between p-4 md:p-6 border-b border-white/5 shrink-0">
                <button
                    onClick={toggleDevices}
                    className="p-3 text-neutral-400 hover:text-white transition-colors rounded-full hover:bg-white/5 active:scale-90"
                >
                    <ChevronDown size={28} className="md:hidden" />
                    <X size={24} className="hidden md:block" />
                </button>
                <h2 className="text-white font-bold text-lg">Dispositivos</h2>
                <div className="w-10" /> {/* Spacer */}
            </div>

            {/* List */}
            <div ref={contentRef} className="flex-1 overflow-y-auto p-4 md:p-6 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                <div className="flex flex-col gap-6">
                    {/* Dispositivo Actual */}
                    <div>
                        <h3 className="text-neutral-400 text-xs font-bold uppercase tracking-wider mb-3">Dispositivo actual</h3>
                        <div className="flex items-center gap-4 bg-brand-500/10 p-4 rounded-xl border border-brand-500/20">
                            <div className="w-12 h-12 bg-brand-500 rounded-full flex items-center justify-center text-white shrink-0">
                                <Laptop size={24} />
                            </div>
                            <div className="flex flex-col flex-1 min-w-0">
                                <span className="text-white font-bold truncate">Navegador Actual</span>
                                <span className="text-brand-400 text-sm truncate flex items-center gap-1 mt-0.5">
                                    <Wifi size={14} /> Reproduciendo
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Otros Dispositivos (Mockup) */}
                    <div>
                        <h3 className="text-neutral-400 text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-2">
                            <Cast size={14} /> Otros dispositivos
                        </h3>
                        <div className="flex flex-col gap-2">
                            <button className="flex items-center gap-4 p-4 rounded-xl border border-white/5 hover:bg-white/5 hover:border-white/10 transition-all text-left outline-none">
                                <div className="w-12 h-12 bg-neutral-800 rounded-full flex items-center justify-center text-neutral-400 shrink-0">
                                    <TabletSmartphone size={24} />
                                </div>
                                <div className="flex flex-col flex-1 min-w-0">
                                    <span className="text-white font-bold truncate">{phoneName}</span>
                                    <span className="text-neutral-500 text-sm truncate">Caleta App</span>
                                </div>
                            </button>

                            <button className="flex items-center gap-4 p-4 rounded-xl border border-white/5 hover:bg-white/5 hover:border-white/10 transition-all text-left outline-none">
                                <div className="w-12 h-12 bg-neutral-800 rounded-full flex items-center justify-center text-neutral-400 shrink-0">
                                    <MonitorSpeaker size={24} />
                                </div>
                                <div className="flex flex-col flex-1 min-w-0">
                                    <span className="text-white font-bold truncate">Altavoz Sala</span>
                                    <span className="text-neutral-500 text-sm truncate">Google Cast</span>
                                </div>
                            </button>
                        </div>

                        <div className="mt-8 pt-6 border-t border-white/5 text-center px-4">
                            <p className="text-neutral-400 text-sm leading-relaxed">
                                Escucha en tus altavoces, TV y otros dispositivos que soporte la misma red Wi-Fi o Bluetooth.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

"use client";

import React from "react";
import { usePlayer } from "@/context/PlayerContext";
import { useAuth } from "@/context/AuthContext";
import { X, TabletSmartphone, Laptop, MonitorSpeaker, Wifi, Cast } from "lucide-react";

export default function DevicesPanel() {
    const {
        isDevicesVisible,
        toggleDevices
    } = usePlayer();

    const { user } = useAuth();
    const userName = user?.user_metadata?.username || user?.user_metadata?.name || 'Usuario';
    const phoneName = `Teléfono de ${userName.split(' ')[0]}`;

    return (
        <div className={`fixed top-0 right-0 bottom-[60px] md:bottom-[90px] w-full md:w-[400px] bg-[#121216] border-l border-white/5 z-40 flex flex-col shadow-2xl transition-transform duration-300 transform ${isDevicesVisible ? 'translate-x-0' : 'translate-x-full'}`}>
            {/* Header */}
            <div className="flex items-center justify-between p-4 md:p-6 border-b border-white/5 shrink-0">
                <h2 className="text-white font-bold text-lg">Dispositivos</h2>
                <button
                    onClick={toggleDevices}
                    className="p-2 text-neutral-400 hover:text-white transition-colors rounded-full hover:bg-white/5"
                >
                    <X size={20} />
                </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
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

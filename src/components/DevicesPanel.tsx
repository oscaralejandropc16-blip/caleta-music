"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { usePlayer } from "@/context/PlayerContext";
import { useAuth } from "@/context/AuthContext";
import { X, TabletSmartphone, Laptop, MonitorSpeaker, Wifi, Cast, ChevronDown, Check, Loader2, Plus } from "lucide-react";
import { ExternalDevice, quickScanSonos, sonosPlayUrl, sonosPause, sonosGetDeviceInfo, saveDeviceIP } from "@/lib/deviceService";

export default function DevicesPanel() {
    const {
        isDevicesVisible,
        toggleDevices,
        currentTrack,
        isPlaying
    } = usePlayer();

    const { user } = useAuth();
    const userName = user?.user_metadata?.username || user?.user_metadata?.name || 'Usuario';

    const [devices, setDevices] = useState<ExternalDevice[]>([]);
    const [isScanning, setIsScanning] = useState(false);
    const [activeDevice, setActiveDevice] = useState<string>('local'); // 'local' or device.id
    const [manualIp, setManualIp] = useState("");
    const [showManualAdd, setShowManualAdd] = useState(false);

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

    useEffect(() => {
        if (isDevicesVisible && devices.length === 0) {
            scanDevices();
        }
    }, [isDevicesVisible]);

    const scanDevices = async () => {
        setIsScanning(true);
        try {
            const foundSonos = await quickScanSonos();
            setDevices(foundSonos);
        } catch (e) {
            console.error("Scan failed", e);
        }
        setIsScanning(false);
    };

    const handleAddManualSonos = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!manualIp) return;

        setIsScanning(true);
        const info = await sonosGetDeviceInfo(manualIp);
        if (info) {
            saveDeviceIP(manualIp);
            setDevices(prev => [...prev.filter(d => d.ip !== manualIp), {
                id: `sonos-${manualIp}`,
                name: info.roomName,
                type: 'sonos',
                ip: manualIp,
                port: 1400,
                model: info.modelName,
                roomName: info.roomName,
            }]);
            setShowManualAdd(false);
            setManualIp("");
        } else {
            alert("No se encontró ningún altavoz Sonos en la IP: " + manualIp);
        }
        setIsScanning(false);
    };

    const selectDevice = async (device: ExternalDevice | 'local') => {
        setActiveDevice(device === 'local' ? 'local' : device.id);

        // If switching to a Sonos device, optionally start playing the current track there
        if (device !== 'local' && device.type === 'sonos' && currentTrack && isPlaying) {
            const RAILWAY_API = "https://caleta-music.netlify.app";
            // Determine real stream URL for external device
            let urlToPlay = '';
            if ((currentTrack as any).sourceAudioUrl) {
                urlToPlay = (currentTrack as any).sourceAudioUrl;
            } else {
                urlToPlay = `${RAILWAY_API}/api/deezer?title=${encodeURIComponent(currentTrack.title)}&artist=${encodeURIComponent(currentTrack.artist)}&play=true`;
            }

            if (device.ip) {
                await sonosPlayUrl(device.ip, urlToPlay, currentTrack.title, currentTrack.artist);
            }
        }
    };

    // Construct the deep link for Alexa App
    // We can launch the Alexa app directly using alexa:// scheme on iOS/Android or redirect to web
    const openAlexaApp = () => {
        const url = 'alexa://'; // Intent to open Alexa App
        window.location.href = url;
    };

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
            className={`fixed inset-x-0 bottom-0 pt-safe md:pt-0 pb-safe top-0 md:top-0 md:left-auto md:w-[400px] bg-[#121216] md:border-l border-white/5 z-[100] md:z-40 flex flex-col shadow-2xl transition-transform duration-300 transform ${isDevicesVisible ? 'translate-y-0 md:translate-x-0' : 'translate-y-full md:translate-y-0 md:translate-x-full'}`}>

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
                <div className="w-10" />
            </div>

            {/* List */}
            <div ref={contentRef} className="flex-1 overflow-y-auto p-4 md:p-6 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                <div className="flex flex-col gap-6">
                    {/* Dispositivo Actual */}
                    <div>
                        <h3 className="text-neutral-400 text-xs font-bold uppercase tracking-wider mb-3">Dispositivo de reproducción</h3>

                        <button
                            onClick={() => selectDevice('local')}
                            className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all text-left outline-none ${activeDevice === 'local' ? 'bg-brand-500/10 border-brand-500/50 shadow-[0_0_15px_rgba(30,215,96,0.2)]' : 'border-white/5 hover:bg-white/5'}`}
                        >
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${activeDevice === 'local' ? 'bg-brand-500 text-white' : 'bg-neutral-800 text-neutral-400'}`}>
                                <Laptop size={24} />
                            </div>
                            <div className="flex flex-col flex-1 min-w-0">
                                <span className={`font-bold truncate ${activeDevice === 'local' ? 'text-white' : 'text-neutral-300'}`}>Este dispositivo</span>
                                <span className={`text-sm truncate flex items-center gap-1 mt-0.5 ${activeDevice === 'local' ? 'text-brand-400' : 'text-neutral-500'}`}>
                                    {activeDevice === 'local' ? <><Wifi size={14} /> Reproduciendo aquí</> : 'App Local'}
                                </span>
                            </div>
                            {activeDevice === 'local' && <Check size={20} className="text-brand-500" />}
                        </button>
                    </div>

                    {/* Speakers en la red (Sonos, etc) */}
                    <div>
                        <div className="flex flex-row justify-between items-center mb-3">
                            <h3 className="text-neutral-400 text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                                <Cast size={14} /> Altavoces Locales (Sonos)
                            </h3>
                            <button
                                onClick={scanDevices}
                                disabled={isScanning}
                                className="text-brand-400 hover:text-white transition-colors p-1"
                            >
                                {isScanning ? <Loader2 size={16} className="animate-spin" /> : <Wifi size={16} />}
                            </button>
                        </div>

                        <div className="flex flex-col gap-2">
                            {devices.length === 0 && !isScanning && !showManualAdd && (
                                <div className="p-4 border border-dashed border-white/10 rounded-xl text-center flex flex-col items-center gap-2">
                                    <MonitorSpeaker size={24} className="text-neutral-600 mb-1" />
                                    <p className="text-neutral-400 text-sm">No se encontraron altavoces.</p>
                                    <button
                                        onClick={() => setShowManualAdd(true)}
                                        className="text-brand-400 text-sm hover:underline mt-1"
                                    >
                                        Añadir manualmente (IP)
                                    </button>
                                </div>
                            )}

                            {showManualAdd && (
                                <form onSubmit={handleAddManualSonos} className="p-4 bg-white/5 rounded-xl flex gap-2">
                                    <input
                                        type="text"
                                        placeholder="Ej: 192.168.1.50"
                                        value={manualIp}
                                        onChange={e => setManualIp(e.target.value)}
                                        className="flex-1 bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-brand-500"
                                    />
                                    <button
                                        type="submit"
                                        disabled={isScanning || !manualIp}
                                        className="bg-brand-500 text-white p-2 rounded-lg hover:bg-brand-400 disabled:opacity-50"
                                    >
                                        <Plus size={20} />
                                    </button>
                                </form>
                            )}

                            {devices.map(device => (
                                <button
                                    key={device.id}
                                    onClick={() => selectDevice(device)}
                                    className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all text-left outline-none ${activeDevice === device.id ? 'bg-brand-500/10 border-brand-500/50 shadow-[0_0_15px_rgba(30,215,96,0.2)]' : 'border-white/5 hover:bg-white/5'}`}
                                >
                                    <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${activeDevice === device.id ? 'bg-brand-500 text-white' : 'bg-neutral-800 text-neutral-400'}`}>
                                        <MonitorSpeaker size={24} />
                                    </div>
                                    <div className="flex flex-col flex-1 min-w-0">
                                        <span className={`font-bold truncate ${activeDevice === device.id ? 'text-white' : 'text-neutral-300'}`}>
                                            {device.name}
                                        </span>
                                        <span className={`text-sm truncate ${activeDevice === device.id ? 'text-brand-400' : 'text-neutral-500'}`}>
                                            Sonos • {device.ip}
                                        </span>
                                    </div>
                                    {activeDevice === device.id && <Check size={20} className="text-brand-500" />}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Alexa Integration Node */}
                    <div>
                        <h3 className="text-cyan-400 text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-2">
                            Integración con Voz
                        </h3>
                        <div className="flex flex-col gap-2">
                            <button
                                onClick={openAlexaApp}
                                className="flex items-center gap-4 p-4 rounded-xl border border-[#31C4F3]/20 hover:bg-[#31C4F3]/10 hover:border-[#31C4F3]/40 transition-all text-left outline-none group"
                            >
                                <div className="w-12 h-12 bg-[#31C4F3]/20 rounded-full flex items-center justify-center text-[#31C4F3] shrink-0 group-hover:bg-[#31C4F3] group-hover:text-white transition-colors">
                                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-9l6 4.5-6 4.5z" />
                                    </svg>
                                </div>
                                <div className="flex flex-col flex-1 min-w-0">
                                    <span className="text-white font-bold truncate">Amazon Alexa</span>
                                    <span className="text-neutral-400 text-sm truncate">Abrir app de Alexa</span>
                                </div>
                            </button>
                        </div>
                    </div>

                    <div className="mt-4 pt-6 text-center px-4">
                        <p className="text-neutral-500 text-xs leading-relaxed">
                            Controla la reproducción enviando el audio directamente a tu altavoz Sonos mediante red Wi-Fi. Asegúrate de estar en la misma red.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

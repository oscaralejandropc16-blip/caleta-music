"use client";

import { useEffect, useState } from "react";

export default function LoadingScreen() {
    const [progress, setProgress] = useState(0);
    const [fadeOut, setFadeOut] = useState(false);

    useEffect(() => {
        // Simulate loading progress
        const interval = setInterval(() => {
            setProgress(prev => {
                if (prev >= 100) {
                    clearInterval(interval);
                    setTimeout(() => setFadeOut(true), 300);
                    return 100;
                }
                // Fast start, slow middle, fast end
                const step = prev < 30 ? 8 : prev < 70 ? 3 : prev < 90 ? 5 : 10;
                return Math.min(prev + step, 100);
            });
        }, 80);

        return () => clearInterval(interval);
    }, []);

    if (fadeOut) return null;

    return (
        <div
            className={`fixed inset-0 z-[200] flex flex-col items-center justify-center bg-[#060913] transition-opacity duration-700 ${fadeOut ? "opacity-0 pointer-events-none" : "opacity-100"
                }`}
        >
            {/* Ambient background */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-brand-500/10 rounded-full blur-[120px] animate-pulse" />
                <div className="absolute top-1/3 left-1/3 w-[400px] h-[400px] bg-purple-500/8 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '500ms' }} />
                <div className="absolute bottom-1/3 right-1/3 w-[350px] h-[350px] bg-indigo-500/8 rounded-full blur-[80px] animate-pulse" style={{ animationDelay: '1000ms' }} />
            </div>

            {/* Logo with animated ring */}
            <div className="relative mb-8">


                {/* Pulsing glow behind logo */}
                <div className="absolute inset-0 bg-brand-500/30 rounded-2xl blur-xl animate-pulse" />

                {/* Logo icon */}
                <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-400 via-indigo-500 to-purple-600 shadow-[0_0_60px_rgba(99,102,241,0.5)] flex items-center justify-center border border-white/20 overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-b from-white/30 to-transparent opacity-40" />
                    <svg viewBox="0 0 24 24" fill="none" className="relative z-10 w-11 h-11 text-white">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.2" fill="currentColor" fillOpacity="0.05" />
                        {/* Animated equalizer bars */}
                        <rect x="7" y="10" width="2.5" height="6" rx="1.25" fill="currentColor" className="origin-bottom animate-[eq_0.6s_ease-in-out_infinite]" />
                        <rect x="10.75" y="7" width="2.5" height="9" rx="1.25" fill="currentColor" className="origin-bottom animate-[eq_0.8s_ease-in-out_infinite_0.15s]" />
                        <rect x="14.5" y="9" width="2.5" height="7" rx="1.25" fill="currentColor" className="origin-bottom animate-[eq_0.5s_ease-in-out_infinite_0.3s]" />
                    </svg>
                </div>
            </div>

            {/* App name with gradient text */}
            <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-brand-200 to-white mb-2 tracking-tight animate-fade-in-up">
                Caleta Music
            </h1>
            <p className="text-sm text-slate-500 font-medium italic tracking-wider mb-10 animate-fade-in-up" style={{ animationDelay: '200ms' }}>
                La caleta que suena en todos lados
            </p>

            {/* Progress bar */}
            <div className="w-48 h-1 bg-white/10 rounded-full overflow-hidden backdrop-blur-sm">
                <div
                    className="h-full bg-gradient-to-r from-brand-500 via-purple-500 to-brand-400 rounded-full transition-all duration-300 ease-out shadow-[0_0_12px_rgba(99,102,241,0.6)]"
                    style={{ width: `${progress}%` }}
                />
            </div>

            {/* Loading text */}
            <div className="mt-4 flex items-center gap-2">
                <span className="text-xs text-slate-500 font-medium tracking-wider uppercase">
                    Cargando
                </span>
                <span className="flex gap-1">
                    <span className="w-1 h-1 bg-brand-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1 h-1 bg-brand-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1 h-1 bg-brand-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
            </div>
        </div>
    );
}

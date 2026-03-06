"use client";

import { useEffect } from "react";

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error("[App Error Boundary]", error);
    }, [error]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#0a0f1e] p-6">
            <div className="text-center max-w-md">
                <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                        className="text-red-400">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                </div>
                <h2 className="text-2xl font-bold text-white mb-3">
                    Algo salió mal
                </h2>
                <p className="text-slate-400 mb-6 text-sm leading-relaxed">
                    Ocurrió un error inesperado. Intenta recargar la página o limpiar la caché de tu navegador.
                </p>
                <div className="flex flex-col gap-3">
                    <button
                        onClick={reset}
                        className="w-full py-3.5 bg-brand-500 hover:bg-brand-600 text-white font-bold rounded-xl transition-all active:scale-95 shadow-lg shadow-brand-500/20"
                    >
                        Intentar de nuevo
                    </button>
                    <button
                        onClick={() => {
                            try {
                                // Limpiar estado corrupto del player
                                localStorage.removeItem("caleta-player-state");
                                // Limpiar tokens de auth potencialmente corruptos
                                Object.keys(localStorage).forEach(key => {
                                    if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
                                        localStorage.removeItem(key);
                                    }
                                });
                            } catch { }
                            window.location.href = "/";
                        }}
                        className="w-full py-3.5 bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 font-bold rounded-xl transition-all active:scale-95 border border-white/[0.08]"
                    >
                        Limpiar caché y recargar
                    </button>
                </div>
            </div>
        </div>
    );
}

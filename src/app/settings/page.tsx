"use client";

import { useAuth } from "@/context/AuthContext";
import { usePlayer } from "@/context/PlayerContext";
import { ArrowLeft, Moon, Bell, AlertCircle, HardDrive } from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import { clearEntireLibrary } from "@/lib/syncLibrary";

export default function SettingsPage() {
    const { signOut } = useAuth();
    const { audioRef } = usePlayer();

    const [clearing, setClearing] = useState(false);
    const [showClearConfirm, setShowClearConfirm] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [darkMode, setDarkMode] = useState(true);
    const [notificationsOn, setNotificationsOn] = useState(false);

    useEffect(() => {
        // Check initial notification permission
        if ("Notification" in window) {
            setNotificationsOn(Notification.permission === "granted");
        }

        // Check theme
        const isLight = localStorage.getItem("theme") === "light";
        setDarkMode(!isLight);
        if (isLight) {
            document.body.classList.add("light-mode");
        }
    }, []);

    const handleClearStorage = async () => {
        if (clearing) return; // Prevent double click

        setClearing(true);
        try {
            const dbs = await window.indexedDB.databases();
            dbs.forEach(db => {
                if (db.name) window.indexedDB.deleteDatabase(db.name);
            });
            // También borrar la biblioteca de la nube para que no reaparezcan
            await clearEntireLibrary();
            toast.success("Biblioteca limpiada correctamente");
            setShowClearConfirm(false);
            setTimeout(() => {
                window.location.reload();
            }, 1500);
        } catch (err) {
            console.error(err);
            toast.error("Error al borrar datos locales");
        }
        setClearing(false);
    };

    const handleDeleteAccount = async () => {
        try {
            if (audioRef?.current) {
                audioRef.current.pause();
                audioRef.current.removeAttribute('src');
                audioRef.current.load();
            }
            if (typeof window !== 'undefined') {
                const { clearAllLocalData } = await import('@/lib/db');
                await clearAllLocalData();
                localStorage.clear();
            }
        } catch (err) { }

        await signOut();
        window.location.href = "/";
    }

    const handleDakModeToggle = () => {
        const newDarkMode = !darkMode;
        setDarkMode(newDarkMode);

        if (newDarkMode) {
            document.body.classList.remove("light-mode");
            localStorage.setItem("theme", "dark");
            toast("Has vuelto al modo oscuro 🌙", { icon: '😎', style: { borderRadius: '10px', background: '#1e293b', color: '#fff' } });
        } else {
            document.body.classList.add("light-mode");
            localStorage.setItem("theme", "light");
            toast("Modo Claro activado ☀️", { icon: '😎', style: { borderRadius: '10px', background: '#f8fafc', color: '#000' } });
        }
    };

    const handleNotificationToggle = async () => {
        if (!("Notification" in window)) {
            toast.error("Tu navegador no soporta notificaciones");
            return;
        }

        if (notificationsOn) {
            toast("Debes desactivar las notificaciones desde los ajustes de tu navegador", { icon: 'ℹ️' });
            return;
        }

        const permission = await Notification.requestPermission();
        if (permission === "granted") {
            setNotificationsOn(true);
            toast.success("Notificaciones activadas");
            // Test notification
            new Notification("Caleta Music", {
                body: "¡Las notificaciones están funcionando! Te avisaremos cuando tus álbumes se descarguen.",
                icon: "/logo.png"
            });
        } else {
            toast.error("Permiso denegado");
        }
    };

    return (
        <main className="p-4 md:p-8 max-w-3xl mx-auto animate-fade-in-up">
            <div className="flex items-center gap-4 mb-8">
                <Link href="/" className="p-2 rounded-xl hover:bg-white/[0.05] transition-all text-slate-400 hover:text-white">
                    <ArrowLeft size={20} />
                </Link>
                <h1 className="text-3xl font-bold text-white">Configuración</h1>
            </div>

            <div className="space-y-6">
                {/* General Settings */}
                <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] rounded-3xl p-6">
                    <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4">General</h2>

                    <div className="space-y-4">
                        <div
                            onClick={handleDakModeToggle}
                            className="flex items-center justify-between p-3 hover:bg-white/[0.03] rounded-xl transition-colors cursor-pointer"
                        >
                            <div className="flex items-center gap-4">
                                <div className="p-2 bg-brand-500/20 text-brand-400 rounded-lg"><Moon size={18} /></div>
                                <div>
                                    <p className="font-semibold text-white">Tema Oscuro</p>
                                    <p className="text-xs text-slate-400">Caleta Music siempre usa modo oscuro</p>
                                </div>
                            </div>
                            <div className={`w-12 h-6 rounded-full relative transition-colors duration-300 ${darkMode ? 'bg-brand-500' : 'bg-slate-700'}`}>
                                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-md transition-all duration-300 ${darkMode ? 'right-1' : 'right-7'}`}></div>
                            </div>
                        </div>

                        <div
                            onClick={handleNotificationToggle}
                            className="flex items-center justify-between p-3 hover:bg-white/[0.03] rounded-xl transition-colors cursor-pointer"
                        >
                            <div className="flex items-center gap-4">
                                <div className="p-2 bg-purple-500/20 text-purple-400 rounded-lg"><Bell size={18} /></div>
                                <div>
                                    <p className="font-semibold text-white">Notificaciones</p>
                                    <p className="text-xs text-slate-400">Alertas de descargas completadas</p>
                                </div>
                            </div>
                            <div className={`w-12 h-6 rounded-full relative transition-colors duration-300 ${notificationsOn ? 'bg-brand-500' : 'bg-slate-700'}`}>
                                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-md transition-all duration-300 ${notificationsOn ? 'right-1' : 'right-7'}`}></div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Data & Storage */}
                <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] rounded-3xl p-6">
                    <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4">Datos y Almacenamiento</h2>

                    <div className="space-y-4">
                        <div className="flex items-center justify-between p-3 hover:bg-white/[0.03] rounded-xl transition-colors">
                            <div className="flex items-center gap-4">
                                <div className="p-2 bg-pink-500/20 text-pink-400 rounded-lg"><HardDrive size={18} /></div>
                                <div>
                                    <p className="font-semibold text-white">Música Descargada</p>
                                    <p className="text-xs text-slate-400">Gestionada por el navegador</p>
                                </div>
                            </div>
                        </div>

                        <div className={`flex items-center justify-between p-3 rounded-xl transition-colors ${clearing ? 'opacity-50 cursor-not-allowed' : 'hover:bg-brand-500/10 cursor-pointer'} text-brand-400`} onClick={() => !clearing && setShowClearConfirm(true)}>
                            <div className="flex items-center gap-4">
                                <div className="p-2 bg-brand-500/20 rounded-lg"><AlertCircle size={18} /></div>
                                <div>
                                    <p className="font-semibold">{clearing ? "Liberando espacio..." : "Liberar espacio de almacenamiento"}</p>
                                    <p className="text-xs opacity-70">Elimina las descargas locales (mantendrás tus canciones en la nube)</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                {/* Danger Zone */}
                <div className="bg-red-500/5 backdrop-blur-xl border border-red-500/20 rounded-3xl p-6">
                    <h2 className="text-sm font-bold text-red-500 uppercase tracking-widest mb-4">Zona de Peligro</h2>

                    <div className="space-y-4">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                            <div>
                                <p className="font-semibold text-red-500">Eliminar cuenta</p>
                                <p className="text-xs text-slate-400 max-w-sm">
                                    Borrará permanentemente toda tu información y preferencias.
                                </p>
                            </div>
                            <button
                                onClick={() => setShowDeleteConfirm(true)}
                                className="px-5 py-2.5 rounded-xl font-bold text-sm bg-red-500 hover:bg-red-600 text-white shadow-[0_4px_15px_rgba(239,68,68,0.3)] active:scale-95 transition-all outline-none focus-visible:ring-4 focus-visible:ring-red-500/50"
                            >
                                Eliminar cuenta
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Custom Confirm Modal */}
            {showClearConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in-up">
                    <div className="bg-slate-900 border border-slate-700/50 rounded-3xl p-6 md:p-8 max-w-sm w-full shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 rounded-full blur-3xl pointer-events-none" />
                        <div className="relative z-10 text-center">
                            <div className="w-16 h-16 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-5 shadow-lg shadow-red-500/20">
                                <AlertCircle size={32} />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-2">¿Liberar espacio?</h3>
                            <p className="text-sm text-slate-400 mb-8">
                                Las canciones volverán a la nube. Podrás volver a descargarlas o reproducirlas por streaming desde Tu Biblioteca en cualquier momento.
                            </p>
                            <div className="flex flex-col gap-3">
                                <button
                                    onClick={handleClearStorage}
                                    disabled={clearing}
                                    className="w-full py-3.5 rounded-xl bg-red-500 hover:bg-red-600 active:bg-red-700 text-white font-bold transition-all shadow-[0_0_20px_rgba(239,68,68,0.3)] disabled:opacity-50"
                                >
                                    {clearing ? "Borrando..." : "Sí, borrar todo"}
                                </button>
                                <button
                                    onClick={() => setShowClearConfirm(false)}
                                    disabled={clearing}
                                    className="w-full py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-white font-bold transition-all disabled:opacity-50"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de confirmacion de eliminacion de cuenta */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in-up">
                    <div className="bg-[#121216] border border-red-500/20 shadow-[0_0_40px_rgba(239,68,68,0.15)] rounded-3xl w-full max-w-md p-6 relative overflow-hidden">
                        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-red-600 to-rose-500"></div>
                        <h3 className="text-xl font-bold text-white mb-2">¿Estás seguro?</h3>
                        <p className="text-slate-400 text-sm mb-6 leading-relaxed">
                            Esta acción <strong className="text-red-400 font-bold">no se puede deshacer</strong>. Todas tus canciones descargadas, tu biblioteca en la nube y tus configuraciones serán eliminadas permanentemente.
                        </p>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowDeleteConfirm(false)}
                                className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-white font-bold rounded-xl transition-colors text-sm"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleDeleteAccount}
                                className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl shadow-[0_4px_15px_rgba(239,68,68,0.4)] active:scale-95 transition-all text-sm"
                            >
                                Sí, eliminar mi cuenta
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}

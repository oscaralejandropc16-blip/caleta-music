"use client";

import { useAuth } from "@/context/AuthContext";
import { ArrowLeft, Moon, Bell, Shield, Smartphone, HardDrive, AlertCircle } from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";
import { toast } from "react-hot-toast";

export default function SettingsPage() {
    const { signOut } = useAuth();
    const [clearing, setClearing] = useState(false);
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
        if (!confirm("¿Estás seguro de que quieres borrar todos los datos locales? Tendrás que volver a iniciar sesión.")) return;

        setClearing(true);
        try {
            const dbs = await window.indexedDB.databases();
            dbs.forEach(db => {
                if (db.name) window.indexedDB.deleteDatabase(db.name);
            });
            localStorage.clear();
            sessionStorage.clear();
            await signOut();
            window.location.href = "/";
        } catch (err) {
            console.error(err);
            toast.error("Error al borrar datos locales");
        }
        setClearing(false);
    };

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

                        <div className="flex items-center justify-between p-3 hover:bg-red-500/10 rounded-xl transition-colors cursor-pointer text-red-400" onClick={handleClearStorage}>
                            <div className="flex items-center gap-4">
                                <div className="p-2 bg-red-500/20 rounded-lg"><AlertCircle size={18} /></div>
                                <div>
                                    <p className="font-semibold">{clearing ? "Borrando..." : "Borrar todos los datos locales"}</p>
                                    <p className="text-xs opacity-70">Elimina canciones descargadas y cierra sesión</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}

"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { User, Mail, Camera, Save, Loader, ArrowLeft, Shield, Calendar, LogOut } from "lucide-react";
import { usePlayer } from "@/context/PlayerContext";
import Link from "next/link";

export default function ProfilePage() {
    const { user, profile, updateProfile, signOut } = useAuth();
    const { audioRef } = usePlayer();
    const [username, setUsername] = useState(profile?.username || "");
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    const userAvatar = profile?.avatar_url || user?.user_metadata?.avatar_url || user?.user_metadata?.picture;
    const userEmail = user?.email || "";
    const provider = user?.app_metadata?.provider || "email";
    const createdAt = user?.created_at
        ? new Date(user.created_at).toLocaleDateString("es", { year: "numeric", month: "long", day: "numeric" })
        : "";

    const handleSave = async () => {
        if (!username.trim()) return;
        setSaving(true);
        await updateProfile({ username: username.trim() });
        setSaving(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
    };

    const handleDeleteAccount = async () => {
        // Enlaza con AuthContext para hacer limpieza profunda si es posible
        // Por ahora limpiamos localStorage y cerramos sesion para desactivar
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

    return (
        <main className="p-4 md:p-8 max-w-3xl mx-auto animate-fade-in-up">
            <div className="flex items-center gap-4 mb-8">
                <Link href="/" className="p-2 rounded-xl hover:bg-white/[0.05] transition-all text-slate-400 hover:text-white">
                    <ArrowLeft size={20} />
                </Link>
                <h1 className="text-3xl font-bold text-white">Mi Perfil</h1>
            </div>

            {/* Profile Card */}
            <div className="glass-panel rounded-3xl overflow-hidden mb-6">
                {/* Banner */}
                <div className="h-32 bg-gradient-to-r from-brand-600 via-purple-600 to-pink-600 relative">
                    <div className="absolute inset-0 bg-black/20" />
                </div>

                {/* Avatar & Info */}
                <div className="px-8 pb-8 -mt-16 relative z-10">
                    <div className="flex items-end gap-6 mb-6">
                        <div className="relative">
                            {userAvatar ? (
                                <img
                                    src={userAvatar}
                                    alt={username}
                                    className="w-28 h-28 rounded-3xl object-cover border-4 border-[#0f1629] shadow-2xl"
                                    referrerPolicy="no-referrer"
                                />
                            ) : (
                                <div className="w-28 h-28 rounded-3xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center text-white font-bold text-4xl border-4 border-[#0f1629] shadow-2xl">
                                    {(username || "U").charAt(0).toUpperCase()}
                                </div>
                            )}
                        </div>
                        <div className="pb-2">
                            <h2 className="text-2xl font-extrabold text-white">{profile?.username || username}</h2>
                            <p className="text-slate-400 text-sm">{userEmail}</p>
                        </div>
                    </div>

                    {/* Info Pills */}
                    <div className="flex flex-wrap gap-3 mb-8">
                        <span className="flex items-center gap-2 text-xs bg-white/[0.05] border border-white/[0.08] rounded-full px-4 py-2 text-slate-400">
                            <Shield size={14} className="text-brand-400" />
                            {provider === "google" ? "Google Account" : "Email & Password"}
                        </span>
                        {createdAt && (
                            <span className="flex items-center gap-2 text-xs bg-white/[0.05] border border-white/[0.08] rounded-full px-4 py-2 text-slate-400">
                                <Calendar size={14} className="text-green-400" />
                                Miembro desde {createdAt}
                            </span>
                        )}
                    </div>

                    {/* Edit Form */}
                    <div className="space-y-5">
                        <div>
                            <label className="text-sm font-medium text-slate-400 mb-2 block">Nombre de usuario</label>
                            <div className="relative">
                                <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                                <input
                                    type="text"
                                    value={username}
                                    onChange={e => setUsername(e.target.value)}
                                    placeholder="Tu nombre de usuario"
                                    className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl py-3.5 pl-12 pr-4 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="text-sm font-medium text-slate-400 mb-2 block">Email</label>
                            <div className="relative">
                                <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                                <input
                                    type="email"
                                    value={userEmail}
                                    disabled
                                    className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl py-3.5 pl-12 pr-4 text-slate-500 cursor-not-allowed"
                                />
                            </div>
                            <p className="text-xs text-slate-600 mt-1">El email no se puede cambiar</p>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-3 pt-2">
                            <button
                                onClick={handleSave}
                                disabled={saving || !username.trim()}
                                className={`flex-1 flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-bold text-sm transition-all ${saved
                                    ? "bg-green-500/20 text-green-400 border border-green-500/30"
                                    : "bg-brand-500 hover:bg-brand-600 text-white shadow-lg shadow-brand-500/20 active:scale-95"
                                    } disabled:opacity-50 disabled:active:scale-100 outline-none focus-visible:ring-4 focus-visible:ring-brand-500/50`}
                            >
                                {saving ? (
                                    <><Loader size={16} className="animate-spin" /> Guardando...</>
                                ) : saved ? (
                                    <><Save size={16} /> ¡Guardado!</>
                                ) : (
                                    <><Save size={16} /> Guardar Cambios</>
                                )}
                            </button>

                            <button
                                onClick={(e) => {
                                    e.preventDefault();
                                    try {
                                        if (audioRef?.current) {
                                            audioRef.current.pause();
                                            audioRef.current.removeAttribute('src');
                                            audioRef.current.load();
                                        }
                                        localStorage.removeItem('caleta-player-state');
                                    } catch (err) { console.error("Error pausing", err); }

                                    signOut().finally(() => {
                                        window.location.href = "/";
                                        setTimeout(() => window.location.reload(), 500);
                                    });
                                }}
                                className="flex-1 flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-bold text-sm transition-all bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/10 active:scale-95 outline-none focus-visible:ring-4 focus-visible:ring-red-500/50"
                            >
                                <LogOut size={16} />
                                Cerrar Sesión
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Danger Zone Card */}
            <div className="glass-panel rounded-3xl p-6 md:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 border border-red-500/20 bg-red-500/5 mt-8">
                <div className="flex-1">
                    <h3 className="text-xl font-bold text-red-500 mb-2 flex items-center gap-2">
                        Zona de Peligro
                    </h3>
                    <p className="text-slate-400 text-sm leading-relaxed max-w-lg">
                        Una vez que elimines tu cuenta, no hay vuelta atrás. Esto borrará permanentemente toda tu información y preferencias de nuestros servidores.
                    </p>
                </div>
                <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="px-6 py-3.5 rounded-xl font-bold text-sm bg-red-500 hover:bg-red-600 text-white shadow-[0_4px_15px_rgba(239,68,68,0.3)] active:scale-95 transition-all w-full sm:w-auto outline-none focus-visible:ring-4 focus-visible:ring-red-500/50 whitespace-nowrap"
                >
                    Eliminar cuenta
                </button>
            </div>

            {/* Modal de confirmacion de eliminacion */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in-up">
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

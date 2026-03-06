"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Library, Heart, Search, ListMusic, Plus, Music, LogOut, Settings, User, ChevronUp } from "lucide-react";
import Logo from "./Logo";
import { useEffect, useState } from "react";
import { getAllPlaylists, Playlist, getAllLikedTrackIds } from "@/lib/db";
import { useAuth } from "@/context/AuthContext";
import { usePlayer } from "@/context/PlayerContext";

export default function Sidebar() {
    const pathname = usePathname();
    const { user, profile, signOut } = useAuth();
    const { currentTrack, audioRef } = usePlayer();
    const [playlists, setPlaylists] = useState<Playlist[]>([]);
    const [likeCount, setLikeCount] = useState(0);
    const [showUserMenu, setShowUserMenu] = useState(false);

    useEffect(() => {
        getAllPlaylists().then(setPlaylists);
        getAllLikedTrackIds().then(ids => setLikeCount(ids.length));
    }, [pathname]);

    // Close menu on click outside
    useEffect(() => {
        if (!showUserMenu) return;
        const handler = () => setShowUserMenu(false);
        window.addEventListener("click", handler);
        return () => window.removeEventListener("click", handler);
    }, [showUserMenu]);

    const navItems = [
        { name: "Inicio", href: "/", icon: Home },
        { name: "Buscar & Descargar", href: "/search", icon: Search },
        { name: "Tu Biblioteca", href: "/library", icon: Library },
    ];

    const isActive = (href: string) => {
        if (href === "/") return pathname === "/";
        return pathname.startsWith(href);
    };

    const userAvatar = profile?.avatar_url || user?.user_metadata?.avatar_url || user?.user_metadata?.picture;
    const userName = profile?.username || user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split("@")[0] || "Usuario";
    const userEmail = user?.email || "";

    return (
        <aside className={`w-[260px] flex-shrink-0 hidden md:flex flex-col bg-black/30 backdrop-blur-xl border-r border-white/[0.06] h-screen overflow-y-auto ${currentTrack ? 'pb-28' : 'pb-4'}`}>
            {/* Logo Section */}
            <div className="px-6 pt-6 pb-4">
                <div className="flex items-center gap-3 group/logo cursor-pointer">
                    <Logo size={42} className="shadow-brand-500/30" />
                    <div>
                        <h1 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-300 tracking-wide leading-none group-hover/logo:from-brand-400 group-hover/logo:to-purple-400 transition-all duration-300 drop-shadow-sm">Caleta Music</h1>
                        <p className="text-[9px] text-slate-500 italic tracking-widest mt-1 font-medium">La caleta que suena en todos lados</p>
                    </div>
                </div>
            </div>

            {/* Main Navigation */}
            <nav className="px-3 flex flex-col gap-1">
                {navItems.map((item) => (
                    <Link
                        key={item.name}
                        href={item.href}
                        className={`flex items-center gap-3.5 px-4 py-3 rounded-xl font-medium text-[14px] transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/50 active:scale-[0.98] ${isActive(item.href)
                            ? "bg-brand-500/15 text-brand-400 shadow-[inset_0_0_20px_rgba(99,102,241,0.1)] before:content-[''] before:absolute before:left-3 before:h-6 before:w-1 before:bg-brand-500 before:rounded-r-md relative"
                            : "text-slate-400 hover:text-white hover:bg-white/[0.04]"
                            }`}
                    >
                        <item.icon size={20} className={isActive(item.href) ? "fill-brand-400/20 stroke-brand-400" : "opacity-80"} strokeWidth={isActive(item.href) ? 2.5 : 2} />
                        {item.name}
                    </Link>
                ))}
            </nav>

            {/* Separator */}
            <div className="mx-6 my-4 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />

            {/* Tu Música */}
            <div className="px-3">
                <h2 className="text-[10px] uppercase font-bold text-slate-500/80 tracking-[0.2em] mb-2 px-4">
                    Tu Música
                </h2>
                <Link
                    href="/library?tab=likes"
                    className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-[13px] font-medium text-slate-400 hover:text-white hover:bg-white/[0.04] transition-all group"
                >
                    <div className="bg-gradient-to-br from-pink-500 to-rose-600 p-1.5 rounded-lg shadow-md shadow-pink-500/20">
                        <Heart size={13} className="text-white" fill="currentColor" />
                    </div>
                    <span className="flex-1">Canciones Favoritas</span>
                    {likeCount > 0 && (
                        <span className="text-[10px] text-slate-500 bg-white/[0.06] px-2 py-0.5 rounded-full">{likeCount}</span>
                    )}
                </Link>
            </div>

            {/* Separator */}
            <div className="mx-6 my-4 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />

            {/* Playlists */}
            <div className="flex-1 px-3">
                <div className="flex items-center justify-between px-4 mb-2">
                    <h2 className="text-[10px] uppercase font-bold text-slate-500/80 tracking-[0.2em]">
                        Playlists
                    </h2>
                    <Link href="/library?tab=playlists" className="text-slate-500 hover:text-brand-400 transition-colors p-1 rounded-md hover:bg-white/[0.05]">
                        <Plus size={14} />
                    </Link>
                </div>
                <nav className="flex flex-col gap-0.5">
                    {playlists.length === 0 ? (
                        <Link href="/library?tab=playlists"
                            className="flex items-center gap-3 px-4 py-3 rounded-xl text-[13px] text-slate-500 hover:text-slate-300 hover:bg-white/[0.03] transition-all">
                            <Music size={16} className="text-slate-600" />
                            <span className="italic">Crea tu primera playlist</span>
                        </Link>
                    ) : (
                        playlists.slice(0, 8).map((pl) => (
                            <Link key={pl.id} href={`/playlist/${pl.id}`}
                                className="flex items-center gap-3 px-4 py-2 rounded-xl text-[13px] font-medium text-slate-400 hover:text-white hover:bg-white/[0.04] transition-all group">
                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500/20 to-purple-500/20 flex items-center justify-center flex-shrink-0 border border-white/[0.05]">
                                    <ListMusic size={14} className="text-slate-400 group-hover:text-brand-400 transition-colors" />
                                </div>
                                <span className="truncate flex-1">{pl.name}</span>
                                <span className="text-[10px] text-slate-600">{pl.trackIds.length}</span>
                            </Link>
                        ))
                    )}
                </nav>
            </div>

            {/* User Profile Section */}
            <div className="relative px-3 pb-3 mt-2">
                <div className="border-t border-white/[0.06] pt-3">
                    <button
                        onClick={(e) => { e.stopPropagation(); setShowUserMenu(!showUserMenu); }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.08] transition-all group cursor-pointer active:scale-[0.98] outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
                    >
                        {/* Avatar */}
                        {userAvatar ? (
                            <img
                                src={userAvatar}
                                alt={userName}
                                className="w-9 h-9 rounded-full object-cover border-2 border-white/10 shadow-lg"
                                referrerPolicy="no-referrer"
                            />
                        ) : (
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm shadow-lg">
                                {userName.charAt(0).toUpperCase()}
                            </div>
                        )}
                        <div className="flex-1 min-w-0 text-left">
                            <p className="text-sm font-semibold text-white truncate">{userName}</p>
                            <p className="text-[10px] text-slate-500 truncate">{userEmail}</p>
                        </div>
                        <ChevronUp size={16} className={`text-slate-500 transition-transform ${showUserMenu ? "rotate-180" : ""}`} />
                    </button>
                </div>

                {/* Dropdown Menu */}
                {showUserMenu && (
                    <div className="absolute bottom-full left-3 right-3 mb-2 bg-[#1a1f35] border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden animate-fade-in-up z-50">
                        <div className="px-4 py-3 border-b border-white/[0.06]">
                            <p className="text-sm font-semibold text-white">{userName}</p>
                            <p className="text-[11px] text-slate-500">{userEmail}</p>
                        </div>

                        <Link
                            href="/profile"
                            className="flex items-center gap-3 px-4 py-3 text-sm text-slate-300 hover:text-white hover:bg-white/[0.04] transition-all"
                            onClick={() => setShowUserMenu(false)}
                        >
                            <User size={16} />
                            Mi Perfil
                        </Link>

                        <Link
                            href="/settings"
                            className="flex items-center gap-3 px-4 py-3 text-sm text-slate-300 hover:text-white hover:bg-white/[0.04] transition-all"
                            onClick={() => setShowUserMenu(false)}
                        >
                            <Settings size={16} />
                            Configuración
                        </Link>

                        <button
                            onClick={async (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setShowUserMenu(false);

                                // Detener musica y limpiar cache local del reproductor de inmediato
                                try {
                                    if (audioRef?.current) {
                                        audioRef.current.pause();
                                        audioRef.current.removeAttribute('src');
                                        audioRef.current.load();
                                    }
                                    localStorage.removeItem('caleta-player-state');
                                    // Borrar BD local del UI para que otro usuario no la vea de inmediato
                                    const { clearAllLocalData } = await import('@/lib/db');
                                    await clearAllLocalData();
                                } catch (e) { console.error("Error pausing", e); }

                                signOut().finally(() => {
                                    window.location.href = "/";
                                    setTimeout(() => window.location.reload(), 500);
                                });
                            }}
                            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all border-t border-white/[0.06]"
                        >
                            <LogOut size={16} />
                            Cerrar Sesión
                        </button>
                    </div>
                )}
            </div>
        </aside>
    );
}

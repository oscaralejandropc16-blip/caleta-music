"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Library, Search, User } from "lucide-react";

export default function BottomNav() {
    const pathname = usePathname();

    const navItems = [
        { name: "Inicio", href: "/", icon: Home },
        { name: "Buscar", href: "/search", icon: Search },
        { name: "Biblioteca", href: "/library", icon: Library },
        { name: "Perfil", href: "/profile", icon: User },
    ];

    const isActive = (href: string) => {
        if (href === "/") return pathname === "/";
        return pathname.startsWith(href);
    };

    return (
        <div
            className="md:hidden fixed bottom-0 left-0 right-0 z-50 pointer-events-none flex justify-center pb-4"
            style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 6px))' }}
        >
            <nav className="pointer-events-auto flex items-center justify-between px-2 py-2 bg-[#060913]/60 backdrop-blur-3xl border border-white/10 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.8)] rounded-3xl w-[92%] max-w-[400px]">
                {navItems.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.href);
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            aria-label={item.name}
                            className={`flex flex-col items-center justify-center w-[22%] gap-1 transition-all duration-300 active:scale-90 outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 rounded-2xl ${active ? "text-white" : "text-slate-400 hover:text-slate-300"
                                }`}
                        >
                            <div className={`p-2.5 rounded-2xl transition-all duration-500 relative ${active ? "bg-brand-500/20" : "bg-transparent"}`}>
                                {active && (
                                    <div className="absolute inset-0 bg-brand-500/30 blur-md rounded-2xl pointer-events-none"></div>
                                )}
                                <Icon size={24} className={`relative z-10 ${active ? "fill-brand-400/30 stroke-brand-400" : "opacity-80"}`} strokeWidth={active ? 2.5 : 2} />
                            </div>
                            <span className={`text-[10px] tracking-wide transition-all duration-300 ${active ? "font-bold text-brand-100" : "font-medium"}`}>{item.name}</span>
                        </Link>
                    );
                })}
            </nav>
        </div>
    );
}

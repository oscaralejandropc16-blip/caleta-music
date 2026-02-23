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
        <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-[#0a0f1e]/90 backdrop-blur-xl border-t border-white/[0.08] z-50 flex items-center justify-around px-2 pb-safe light-mode:bg-white/90">
            {navItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${active ? "text-brand-500" : "text-slate-400 hover:text-slate-300 light-mode:hover:text-slate-600"
                            }`}
                    >
                        <Icon size={20} className={active ? "fill-brand-500/20" : ""} />
                        <span className="text-[10px] font-medium">{item.name}</span>
                    </Link>
                );
            })}
        </nav>
    );
}

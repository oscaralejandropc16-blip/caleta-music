"use client";

import { useAuth } from "@/context/AuthContext";
import Sidebar from "@/components/Sidebar";
import AudioPlayer from "@/components/AudioPlayer";
import BottomNav from "@/components/BottomNav";
import AuthPage from "@/app/auth/page";

export default function AppShell({ children }: { children: React.ReactNode }) {
    const { user, loading } = useAuth();

    // Loading screen
    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-[#0a0f1e]">
                <div className="flex flex-col items-center gap-4 animate-fade-in-up">
                    <div className="w-16 h-16 relative">
                        <div className="absolute inset-0 border-4 border-brand-500/30 rounded-full"></div>
                        <div className="absolute inset-0 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                    <p className="text-slate-400 font-medium">Cargando Caleta Music...</p>
                </div>
            </div>
        );
    }

    // Not logged in — show auth
    if (!user) {
        return <AuthPage />;
    }

    // Logged in — show app
    return (
        <div className="flex h-screen overflow-hidden">
            <Sidebar />
            <div className="flex-1 overflow-y-auto pb-40 md:pb-28">
                {children}
            </div>
            <AudioPlayer />
            <BottomNav />
        </div>
    );
}

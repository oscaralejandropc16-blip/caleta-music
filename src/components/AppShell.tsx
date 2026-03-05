"use client";

import { useAuth } from "@/context/AuthContext";
import Sidebar from "@/components/Sidebar";
import AudioPlayer from "@/components/AudioPlayer";
import BottomNav from "@/components/BottomNav";
import QueuePanel from "@/components/QueuePanel";
import DevicesPanel from "@/components/DevicesPanel";
import LyricsPanel from "@/components/LyricsPanel";
import AuthPage from "@/app/auth/page";
import LoadingScreen from "@/components/LoadingScreen";

export default function AppShell({ children }: { children: React.ReactNode }) {
    const { user, loading } = useAuth();

    // Loading screen
    if (loading) {
        return <LoadingScreen />;
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
            <QueuePanel />
            <DevicesPanel />
            <LyricsPanel />
            <AudioPlayer />
            <BottomNav />
        </div>
    );
}

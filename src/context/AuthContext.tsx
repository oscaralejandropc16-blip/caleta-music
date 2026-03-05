"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { fullSync } from "@/lib/syncService";
import type { User, Session } from "@supabase/supabase-js";

interface UserProfile {
    id: string;
    username: string;
    avatar_url: string | null;
    created_at: string;
}

interface AuthContextType {
    user: User | null;
    profile: UserProfile | null;
    session: Session | null;
    loading: boolean;
    signUp: (email: string, password: string, username: string) => Promise<{ error: string | null }>;
    signIn: (email: string, password: string) => Promise<{ error: string | null }>;
    signInWithGoogle: () => Promise<{ error: string | null }>;
    signOut: () => Promise<void>;
    updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);

    const loadProfile = async (userId: string, userMeta?: any) => {
        try {
            const { data, error } = await supabase
                .from("profiles")
                .select("*")
                .eq("id", userId)
                .single();

            if (data && !error) {
                setProfile(data as UserProfile);
            } else if (error && error.code === "PGRST116") {
                // Profile doesn't exist yet — create it (e.g. from Google OAuth)
                const username = userMeta?.full_name || userMeta?.name || userMeta?.email?.split("@")[0] || "Usuario";
                const avatar = userMeta?.avatar_url || userMeta?.picture || null;
                const newProfile = {
                    id: userId,
                    username,
                    avatar_url: avatar,
                    created_at: new Date().toISOString(),
                };
                await supabase.from("profiles").upsert(newProfile);
                setProfile(newProfile as UserProfile);
            }
        } catch (err) {
            console.error("Error loading profile:", err);
        }
    };

    useEffect(() => {
        let isMounted = true;

        // Safety timeout — never stay loading more than 5 seconds
        const timeout = setTimeout(() => {
            if (isMounted && loading) {
                console.warn("Auth loading timeout — proceeding without session");
                setLoading(false);
            }
        }, 5000);

        const init = async () => {
            try {
                const { data: { session: s } } = await supabase.auth.getSession();
                if (!isMounted) return;
                setSession(s);
                setUser(s?.user ?? null);
                if (s?.user) {
                    await loadProfile(s.user.id, s.user.user_metadata);
                    // Sync library from cloud
                    fullSync(s.user.id).catch(e => console.warn("[Sync] initial sync error:", e));
                }
            } catch (err) {
                console.error("Auth init error:", err);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        init();

        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (_event, s) => {
                if (!isMounted) return;
                setSession(s);
                setUser(s?.user ?? null);
                if (s?.user) {
                    await loadProfile(s.user.id, s.user.user_metadata);
                    // Sync library on auth change (login)
                    fullSync(s.user.id).catch(e => console.warn("[Sync] auth change sync error:", e));
                } else {
                    setProfile(null);
                }
                setLoading(false);
            }
        );

        return () => {
            isMounted = false;
            clearTimeout(timeout);
            subscription.unsubscribe();
        };
    }, []);

    const signUp = async (email: string, password: string, username: string) => {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: { username },
            },
        });

        if (error) return { error: error.message };

        if (data.user) {
            await supabase.from("profiles").upsert({
                id: data.user.id,
                username,
                avatar_url: null,
                created_at: new Date().toISOString(),
            });
        }

        return { error: null };
    };

    const signIn = async (email: string, password: string) => {
        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });
        if (error) return { error: error.message };
        return { error: null };
    };

    const signInWithGoogle = async () => {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: "google",
            options: {
                redirectTo: `${window.location.origin}/`,
            },
        });
        if (error) return { error: error.message };
        return { error: null };
    };

    const signOut = async () => {
        try {
            await supabase.auth.signOut();
        } catch (e) { console.error("Signout API error", e); }

        try {
            // Forcefully clear supabase tokens from localstorage just in case
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
                    localStorage.removeItem(key);
                }
            });
        } catch (e) { }

        setUser(null);
        setProfile(null);
        setSession(null);
    };

    const updateProfile = async (updates: Partial<UserProfile>) => {
        if (!user) return;
        await supabase.from("profiles").update(updates).eq("id", user.id);
        setProfile(prev => prev ? { ...prev, ...updates } : null);
    };

    return (
        <AuthContext.Provider value={{ user, profile, session, loading, signUp, signIn, signInWithGoogle, signOut, updateProfile }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used within AuthProvider");
    return ctx;
}

"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { Music, Mail, Lock, User, Eye, EyeOff, Loader, AlertCircle } from "lucide-react";
import Image from "next/image";

export default function AuthPage() {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [username, setUsername] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const { signIn, signUp, signInWithGoogle } = useAuth();
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);
        setLoading(true);

        if (isLogin) {
            const result = await signIn(email, password);
            if (result.error) {
                setError(translateError(result.error));
            } else {
                router.push("/");
            }
        } else {
            if (!username.trim()) {
                setError("Ingresa un nombre de usuario");
                setLoading(false);
                return;
            }
            if (password.length < 6) {
                setError("La contraseña debe tener al menos 6 caracteres");
                setLoading(false);
                return;
            }
            const result = await signUp(email, password, username.trim());
            if (result.error) {
                setError(translateError(result.error));
            } else {
                setSuccess("¡Cuenta creada! Revisa tu email para confirmar tu cuenta.");
            }
        }
        setLoading(false);
    };

    const handleGoogleSignIn = async () => {
        setGoogleLoading(true);
        setError(null);
        const result = await signInWithGoogle();
        if (result.error) {
            setError(translateError(result.error));
            setGoogleLoading(false);
        }
        // Google redirects, no need to stop loading
    };

    const translateError = (msg: string) => {
        if (msg.includes("Invalid login")) return "Email o contraseña incorrectos";
        if (msg.includes("already registered")) return "Este email ya está registrado";
        if (msg.includes("invalid email")) return "Email no válido";
        if (msg.includes("Password")) return "La contraseña debe tener al menos 6 caracteres";
        if (msg.includes("rate limit")) return "Demasiados intentos. Espera un momento.";
        return msg;
    };

    return (
        <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
            {/* Animated background */}
            <div className="absolute inset-0 bg-gradient-to-br from-[#0a0e1a] via-[#0f1629] to-[#0a0e1a]" />
            <div className="absolute top-1/4 -left-32 w-96 h-96 bg-brand-500/10 rounded-full blur-[120px] animate-pulse" />
            <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-purple-500/10 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: "1s" }} />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-brand-600/5 rounded-full blur-[150px]" />

            {/* Floating notes */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                {["🎵", "🎶", "🎸", "🎤", "🎧", "🎹"].map((note, i) => (
                    <span
                        key={i}
                        className="absolute text-2xl opacity-10 animate-float-note"
                        style={{
                            left: `${10 + i * 15}%`,
                            top: `${20 + ((i * 37) % 60)}%`,
                            animationDelay: `${i * 0.8}s`,
                            animationDuration: `${6 + i * 1.5}s`,
                        }}
                    >
                        {note}
                    </span>
                ))}
            </div>

            {/* Auth Card */}
            <div className="relative z-10 w-full max-w-md mx-4">
                {/* Logo */}
                <div className="text-center mb-8 animate-fade-in-up">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-brand-500 to-purple-600 shadow-2xl shadow-brand-500/30 mb-4">
                        <Music size={36} className="text-white" />
                    </div>
                    <h1 className="text-3xl font-extrabold text-white tracking-tight">Caleta Music</h1>
                    <p className="text-slate-500 text-sm mt-1 italic">La caleta que suena en todos lados</p>
                </div>

                {/* Card */}
                <div className="bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] rounded-3xl p-8 shadow-2xl animate-fade-in-up" style={{ animationDelay: "0.1s" }}>
                    <h2 className="text-xl font-bold text-white text-center mb-6">
                        {isLogin ? "Iniciar Sesión" : "Crear Cuenta"}
                    </h2>

                    {/* Google Button */}
                    <button
                        onClick={handleGoogleSignIn}
                        disabled={googleLoading}
                        className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-100 text-gray-800 font-semibold py-3.5 px-4 rounded-2xl transition-all hover:scale-[1.02] hover:shadow-lg disabled:opacity-60 disabled:hover:scale-100 mb-4"
                    >
                        {googleLoading ? (
                            <Loader size={20} className="animate-spin text-gray-600" />
                        ) : (
                            <svg width="20" height="20" viewBox="0 0 24 24">
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                            </svg>
                        )}
                        {googleLoading ? "Conectando..." : "Continuar con Google"}
                    </button>

                    {/* Divider */}
                    <div className="flex items-center gap-4 my-5">
                        <div className="h-px bg-white/10 flex-1"></div>
                        <span className="text-slate-500 text-xs font-medium uppercase tracking-wider">o</span>
                        <div className="h-px bg-white/10 flex-1"></div>
                    </div>

                    {/* Email Form */}
                    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                        {!isLogin && (
                            <div className="relative">
                                <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                                <input
                                    type="text"
                                    value={username}
                                    onChange={e => setUsername(e.target.value)}
                                    placeholder="Nombre de usuario"
                                    className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl py-3.5 pl-12 pr-4 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
                                />
                            </div>
                        )}

                        <div className="relative">
                            <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                            <input
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                placeholder="Email"
                                required
                                className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl py-3.5 pl-12 pr-4 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
                            />
                        </div>

                        <div className="relative">
                            <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                            <input
                                type={showPassword ? "text" : "password"}
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                placeholder="Contraseña"
                                required
                                className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl py-3.5 pl-12 pr-12 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                            >
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>

                        {error && (
                            <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 animate-fade-in-up">
                                <AlertCircle size={16} />
                                {error}
                            </div>
                        )}

                        {success && (
                            <div className="flex items-center gap-2 text-green-400 text-sm bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3 animate-fade-in-up">
                                <Mail size={16} />
                                {success}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-gradient-to-r from-brand-500 to-purple-600 hover:from-brand-600 hover:to-purple-700 text-white font-bold py-3.5 rounded-xl transition-all hover:scale-[1.02] hover:shadow-lg hover:shadow-brand-500/25 disabled:opacity-60 disabled:hover:scale-100 flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <>
                                    <Loader size={18} className="animate-spin" />
                                    {isLogin ? "Iniciando..." : "Creando cuenta..."}
                                </>
                            ) : (
                                isLogin ? "Iniciar Sesión" : "Crear Cuenta"
                            )}
                        </button>
                    </form>

                    {/* Toggle */}
                    <p className="text-center text-slate-500 text-sm mt-6">
                        {isLogin ? "¿No tienes cuenta?" : "¿Ya tienes cuenta?"}{" "}
                        <button
                            onClick={() => { setIsLogin(!isLogin); setError(null); setSuccess(null); }}
                            className="text-brand-400 hover:text-brand-300 font-semibold transition-colors"
                        >
                            {isLogin ? "Regístrate" : "Inicia sesión"}
                        </button>
                    </p>
                </div>

                {/* Footer */}
                <p className="text-center text-slate-600 text-xs mt-6 animate-fade-in-up" style={{ animationDelay: "0.3s" }}>
                    Caleta Music © 2026 · Tu música, tu estilo
                </p>
            </div>
        </div>
    );
}

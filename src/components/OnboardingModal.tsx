"use client";

import React, { useState, useEffect } from "react";
import { Check, Sparkles, UserPlus } from "lucide-react";

export const TOP_ARTISTS = [
    { name: "Bad Bunny", image: "https://cdn-images.dzcdn.net/images/artist/45aaf836629158d714432ae37e552ee7/500x500-000000-80-0-0.jpg" },
    { name: "Taylor Swift", image: "https://cdn-images.dzcdn.net/images/artist/e528e270424103b527f8a27ac625563b/500x500-000000-80-0-0.jpg" },
    { name: "The Weeknd", image: "https://cdn-images.dzcdn.net/images/artist/581693b4724a7fcfa754455101e13a44/500x500-000000-80-0-0.jpg" },
    { name: "Drake", image: "https://cdn-images.dzcdn.net/images/artist/5d2fa7f140a6bdc2c864c3465a61fc71/500x500-000000-80-0-0.jpg" },
    { name: "Karol G", image: "https://cdn-images.dzcdn.net/images/artist/dd8c6b3068d2761955eb6e432046ed91/500x500-000000-80-0-0.jpg" },
    { name: "Feid", image: "https://cdn-images.dzcdn.net/images/artist/a37d75aa98b04da700412398a988c31a/500x500-000000-80-0-0.jpg" },
    { name: "Peso Pluma", image: "https://cdn-images.dzcdn.net/images/artist/f70d31b813e98c39498bca9ec5e88911/500x500-000000-80-0-0.jpg" },
    { name: "Dua Lipa", image: "https://cdn-images.dzcdn.net/images/artist/7375742a46dbebb6efc0ae362e18eb24/500x500-000000-80-0-0.jpg" },
    { name: "Shakira", image: "https://cdn-images.dzcdn.net/images/artist/69c569506a8ff6ab0edfecbd1adf94b0/500x500-000000-80-0-0.jpg" },
    { name: "Rauw Alejandro", image: "https://cdn-images.dzcdn.net/images/artist/0e7b2b93b91789a054bc3f08bb3df3a8/500x500-000000-80-0-0.jpg" },
    { name: "J Balvin", image: "https://cdn-images.dzcdn.net/images/artist/325eaa46bc25052d0e3d549d60cc8225/500x500-000000-80-0-0.jpg" },
    { name: "Billie Eilish", image: "https://cdn-images.dzcdn.net/images/artist/8eab1a9a644889aabaca1e193e05f984/500x500-000000-80-0-0.jpg" },
    { name: "Ed Sheeran", image: "https://cdn-images.dzcdn.net/images/artist/d6bb84390641d8ae9118228d9544e53d/500x500-000000-80-0-0.jpg" },
    { name: "Aventura", image: "https://cdn-images.dzcdn.net/images/artist/8d7b77db2a5e318b72ebff508d962d72/500x500-000000-80-0-0.jpg" },
    { name: "Travis Scott", image: "https://cdn-images.dzcdn.net/images/artist/8d8316146026d7e6ce377e314536df62/500x500-000000-80-0-0.jpg" },
];

export default function OnboardingModal({
    userId,
    onComplete
}: {
    userId: string,
    onComplete: (selectedArtists: string[]) => void
}) {
    const [selected, setSelected] = useState<string[]>([]);

    const toggleArtist = (name: string) => {
        setSelected(prev =>
            prev.includes(name)
                ? prev.filter(n => n !== name)
                : [...prev, name]
        );
    };

    const handleSave = () => {
        if (selected.length < 3) return;
        localStorage.setItem(`caleta_artists_${userId}`, JSON.stringify(selected));
        onComplete(selected);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl animate-fade-in">
            <div className="bg-[#0a0f1e] w-full max-w-4xl max-h-[90vh] rounded-3xl overflow-hidden shadow-[0_0_80px_rgba(99,102,241,0.2)] border border-white/10 flex flex-col relative animate-scale-up">

                {/* Glow Effects */}
                <div className="absolute -top-40 -left-40 w-96 h-96 bg-brand-500/20 rounded-full blur-[100px] pointer-events-none" />
                <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-pink-500/10 rounded-full blur-[100px] pointer-events-none" />

                {/* Header */}
                <div className="p-8 pb-4 text-center relative z-10 border-b border-white/[0.05]">
                    <div className="w-16 h-16 bg-brand-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-brand-500/20">
                        <Sparkles size={28} className="text-brand-400" />
                    </div>
                    <h2 className="text-3xl font-black text-white mb-2 tracking-tight drop-shadow-sm">
                        ¿Qué artistas te gustan?
                    </h2>
                    <p className="text-slate-400 font-medium">
                        Selecciona al menos 3 para crear tu perfil musical perfecto.
                    </p>
                </div>

                {/* Body / Grid */}
                <div className="p-6 md:p-8 overflow-y-auto flex-1 z-10 custom-scrollbar">
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4 md:gap-6">
                        {TOP_ARTISTS.map(artist => {
                            const isSelected = selected.includes(artist.name);
                            return (
                                <button
                                    key={artist.name}
                                    onClick={() => toggleArtist(artist.name)}
                                    className={`group flex flex-col items-center gap-3 transition-all duration-300 outline-none active:scale-95 ${isSelected ? "opacity-100 scale-105" : "opacity-70 hover:opacity-100"
                                        }`}
                                >
                                    <div className="relative w-full aspect-square">
                                        <img
                                            src={artist.image}
                                            alt={artist.name}
                                            referrerPolicy="no-referrer"
                                            className={`w-full h-full rounded-full object-cover shadow-lg transition-all duration-300 ${isSelected
                                                ? "ring-4 ring-brand-500 ring-offset-4 ring-offset-[#0a0f1e]"
                                                : "group-hover:ring-4 group-hover:ring-white/20 group-hover:ring-offset-2 group-hover:ring-offset-[#0a0f1e]"
                                                }`}
                                        />
                                        {isSelected && (
                                            <div className="absolute bottom-0 right-0 w-8 h-8 bg-brand-500 rounded-full border-4 border-[#0a0f1e] flex items-center justify-center animate-scale-up z-10">
                                                <Check size={14} className="text-white" strokeWidth={3} />
                                            </div>
                                        )}
                                    </div>
                                    <span className={`text-sm font-bold truncate w-full text-center transition-colors ${isSelected ? "text-brand-400" : "text-white group-hover:text-slate-200"
                                        }`}>
                                        {artist.name}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-white/[0.05] bg-black/20 flex flex-col sm:flex-row items-center justify-between gap-4 z-10">
                    <div className="flex gap-4 items-center">
                        <button
                            onClick={() => {
                                localStorage.setItem(`caleta_artists_${userId}`, JSON.stringify([]));
                                onComplete([]);
                            }}
                            className="px-6 py-3.5 text-slate-400 hover:text-white font-bold rounded-xl transition-all active:scale-95 hover:bg-white/5"
                        >
                            Omitir
                        </button>
                        <p className="text-sm font-semibold text-slate-400 hidden sm:block">
                            {selected.length < 3
                                ? `Selecciona ${3 - selected.length} más`
                                : <span className="text-brand-400">¡Excelente elección!</span>}
                        </p>
                    </div>
                    <button
                        disabled={selected.length < 3}
                        onClick={handleSave}
                        className="w-full sm:w-auto px-8 py-3.5 bg-brand-500 hover:bg-brand-400 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold rounded-xl transition-all shadow-[0_4px_20px_rgba(99,102,241,0.3)] disabled:shadow-none hover:shadow-[0_4px_25px_rgba(99,102,241,0.5)] active:scale-95"
                    >
                        Comenzar a escuchar
                    </button>
                </div>
            </div>
        </div>
    );
}

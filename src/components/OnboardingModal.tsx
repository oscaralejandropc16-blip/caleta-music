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

export const RELATED_ARTISTS: Record<string, { name: string, image: string }[]> = {
    "Bad Bunny": [
        { name: "Jhayco", image: "https://cdns-images.dzcdn.net/images/artist/f19ccfccf2ca98dcebe1ba5e022f4705/500x500.jpg" },
        { name: "Mora", image: "https://cdns-images.dzcdn.net/images/artist/f19f6a7d6ab6f8e759fc01dc07f0f62d/500x500.jpg" },
        { name: "Eladio Carrion", image: "https://cdns-images.dzcdn.net/images/artist/3ba74872fdbbf930eb2fd35ed8ae9b70/500x500.jpg" }
    ],
    "Taylor Swift": [
        { name: "Olivia Rodrigo", image: "https://cdns-images.dzcdn.net/images/artist/c6e398d57d54d9c490a618dc2c10b7b1/500x500.jpg" },
        { name: "Sabrina Carpenter", image: "https://cdns-images.dzcdn.net/images/artist/73397bd3e573a46fb310da725cf9a96e/500x500.jpg" }
    ],
    "The Weeknd": [
        { name: "Bruno Mars", image: "https://cdns-images.dzcdn.net/images/artist/81861ffbf77209ce39fc17294bb81fbe/500x500.jpg" },
        { name: "Post Malone", image: "https://cdns-images.dzcdn.net/images/artist/fa6e9273c5baea93ebbc29d74f2ac44d/500x500.jpg" }
    ],
    "Drake": [
        { name: "Kendrick Lamar", image: "https://cdns-images.dzcdn.net/images/artist/4dcc98ebf95a32b904fc4fdc088af298/500x500.jpg" },
        { name: "21 Savage", image: "https://cdns-images.dzcdn.net/images/artist/eab902ebdc16db73d579c8d10b77e8a9/500x500.jpg" }
    ],
    "Karol G": [
        { name: "Becky G", image: "https://cdns-images.dzcdn.net/images/artist/dcb4054a323db014cd7f2b91b92c4cd7/500x500.jpg" },
        { name: "Natti Natasha", image: "https://cdns-images.dzcdn.net/images/artist/30948c58229bd8dca531dbbb059a41ab/500x500.jpg" }
    ],
    "Feid": [
        { name: "Young Miko", image: "https://cdns-images.dzcdn.net/images/artist/3ff94db3aee57db0b5336e4f4dc1e809/500x500.jpg" },
        { name: "Blessd", image: "https://cdns-images.dzcdn.net/images/artist/fc6fedfc5cf32df73fac82570d5eeb2c/500x500.jpg" },
        { name: "Ryan Castro", image: "https://cdns-images.dzcdn.net/images/artist/db8591dd8a49ba4da7d6fabb58e5f22e/500x500.jpg" }
    ],
    "Peso Pluma": [
        { name: "Natanael Cano", image: "https://cdns-images.dzcdn.net/images/artist/6b176ba4e2f8eff94e1fd538805f7ee9/500x500.jpg" },
        { name: "Fuerza Regida", image: "https://cdns-images.dzcdn.net/images/artist/9e8b7468132d20ddec7f0e34c38d384c/500x500.jpg" },
        { name: "Junior H", image: "https://cdns-images.dzcdn.net/images/artist/ed018d99815ad700949de48adea24c25/500x500.jpg" }
    ],
    "Dua Lipa": [
        { name: "Miley Cyrus", image: "https://cdns-images.dzcdn.net/images/artist/05aa2e8fa6b8cb738c823acc47f8ba16/500x500.jpg" },
        { name: "Doja Cat", image: "https://cdns-images.dzcdn.net/images/artist/d88049ad03de80b7c7b700f7457bd751/500x500.jpg" }
    ],
    "Shakira": [
        { name: "Rosalía", image: "https://cdns-images.dzcdn.net/images/artist/1e7e72d216d56df935d88f62f0bafeff/500x500.jpg" },
        { name: "Manuel Turizo", image: "https://cdns-images.dzcdn.net/images/artist/e5025a1e26deab97f3747cb90b795213/500x500.jpg" }
    ],
    "Rauw Alejandro": [
        { name: "Myke Towers", image: "https://cdns-images.dzcdn.net/images/artist/e0d16be9cebb9fc3eb5086d3ad925916/500x500.jpg" },
        { name: "Sech", image: "https://cdns-images.dzcdn.net/images/artist/5f9df259ed8ac0dffdc99fde23a2cc7a/500x500.jpg" }
    ],
    "J Balvin": [
        { name: "Maluma", image: "https://cdns-images.dzcdn.net/images/artist/23cbfecb4764b88ba0b8ccbca5f134ee/500x500.jpg" },
        { name: "Ozuna", image: "https://cdns-images.dzcdn.net/images/artist/5b48bc29d91f8fe738096f9a0c7c3b99/500x500.jpg" },
        { name: "Daddy Yankee", image: "https://cdns-images.dzcdn.net/images/artist/5610e7b8da46cfed1b3ef25dc8eb66b5/500x500.jpg" }
    ],
    "Billie Eilish": [
        { name: "Lana Del Rey", image: "https://cdns-images.dzcdn.net/images/artist/31ad34df223a5cfc5c7de334d2847fb8/500x500.jpg" },
        { name: "Conan Gray", image: "https://cdns-images.dzcdn.net/images/artist/80a22fffd03bcff4b2450302bded462e/500x500.jpg" }
    ],
    "Ed Sheeran": [
        { name: "Shawn Mendes", image: "https://cdns-images.dzcdn.net/images/artist/77b85cdd6a4b2bb7dccfb06bb3933c04/500x500.jpg" },
        { name: "Justin Bieber", image: "https://cdns-images.dzcdn.net/images/artist/b62145e69e061ddbcda7c20c02741541/500x500.jpg" }
    ],
    "Aventura": [
        { name: "Romeo Santos", image: "https://cdns-images.dzcdn.net/images/artist/e0338ddf59bd6acfa450dbeb11ceaa84/500x500.jpg" },
        { name: "Prince Royce", image: "https://cdns-images.dzcdn.net/images/artist/2aa5de5076135ddc8a14ec8d0672e816/500x500.jpg" }
    ]
};

export default function OnboardingModal({
    userId,
    onComplete
}: {
    userId: string,
    onComplete: (selectedArtists: string[]) => void
}) {
    const [selected, setSelected] = useState<string[]>([]);
    const [availableArtists, setAvailableArtists] = useState<{ name: string, image: string }[]>(TOP_ARTISTS);

    const toggleArtist = (name: string) => {
        setSelected(prev => {
            const isNowSelected = !prev.includes(name);
            const newSelected = isNowSelected ? [...prev, name] : prev.filter(n => n !== name);

            // Dinámica al estilo Spotify: Mostrar artistas similares inmediatamente tras seleccionar
            if (isNowSelected && RELATED_ARTISTS[name]) {
                setAvailableArtists(currentArtists => {
                    const existingNames = new Set(currentArtists.map(a => a.name));
                    const toAdd = RELATED_ARTISTS[name].filter(r => !existingNames.has(r.name));

                    if (toAdd.length === 0) return currentArtists;

                    // Insertarlas justo después del artista clickeado
                    const clickedIndex = currentArtists.findIndex(a => a.name === name);
                    const newArr = [...currentArtists];
                    newArr.splice(clickedIndex + 1, 0, ...toAdd);
                    return newArr;
                });
            }

            return newSelected;
        });
    };

    const handleSave = () => {
        if (selected.length < 3) return;
        try {
            localStorage.setItem(`caleta_artists_${userId}`, JSON.stringify(selected));
        } catch { /* localStorage not available */ }
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
                        {availableArtists.map((artist, idx) => {
                            const isSelected = selected.includes(artist.name);
                            return (
                                <button
                                    key={`${artist.name}-${idx}`}
                                    onClick={() => toggleArtist(artist.name)}
                                    className={`group flex flex-col items-center gap-3 transition-all duration-300 outline-none active:scale-95 animate-scale-up ${isSelected ? "opacity-100 scale-105" : "opacity-70 hover:opacity-100"
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
                                try {
                                    localStorage.setItem(`caleta_artists_${userId}`, JSON.stringify([]));
                                } catch { /* localStorage not available */ }
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

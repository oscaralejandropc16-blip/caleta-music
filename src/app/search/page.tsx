"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, Download, Check, CheckCircle, XCircle, Loader, SearchX, Music, RefreshCw, Disc3 } from "lucide-react";
import { getAllTracksFromDB } from "@/lib/db";
import { downloadAndSaveTrack, ItunesTrack } from "@/lib/download";
import { usePlayer } from "@/context/PlayerContext";
import AlbumDetailModal from "@/components/AlbumDetailModal";

interface Toast {
    id: number;
    type: "success" | "error";
    message: string;
}

interface AlbumGroup {
    name: string;
    artist: string;
    cover: string;
    trackCount: number;
}

export default function SearchPage() {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<ItunesTrack[]>([]);
    const [loading, setLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [linkInput, setLinkInput] = useState("");
    const [downloadingId, setDownloadingId] = useState<string | null>(null);
    const [linkDownloading, setLinkDownloading] = useState(false);
    const [savedTrackIds, setSavedTrackIds] = useState<Set<string>>(new Set());
    const [toasts, setToasts] = useState<Toast[]>([]);
    const [searchError, setSearchError] = useState(false);
    const [viewMode, setViewMode] = useState<"songs" | "albums">("songs");

    // Album detail modal
    const [albumModal, setAlbumModal] = useState<{
        open: boolean; album: string; artist: string; cover: string;
    }>({ open: false, album: "", artist: "", cover: "" });

    useEffect(() => {
        getAllTracksFromDB().then((tracks) => {
            setSavedTrackIds(new Set(tracks.map((t) => t.id)));
        });
    }, []);

    const showToast = useCallback((type: "success" | "error", message: string) => {
        const id = Date.now();
        setToasts((prev) => [...prev, { id, type, message }]);
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 4000);
    }, []);

    const handleDownload = async (track: ItunesTrack | null, url: string | null, id: string) => {
        setDownloadingId(id);
        const success = await downloadAndSaveTrack(track, url, id);
        if (success) {
            setSavedTrackIds((prev) => new Set(prev).add(id));
            showToast("success", track ? `"${track.trackName}" descargada ✓` : "¡Descarga completada y guardada en tu biblioteca!");
        } else {
            showToast("error", "Error al descargar. Intenta de nuevo.");
        }
        setDownloadingId(null);
    };

    const handleLinkDownload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!linkInput.trim() || linkDownloading) return;
        const urlToDownload = linkInput.trim();
        const directId = `link-${Date.now()}`;
        setLinkDownloading(true);

        const success = await downloadAndSaveTrack(null, urlToDownload, directId);
        if (success) {
            setSavedTrackIds((prev) => new Set(prev).add(directId));
            showToast("success", "¡Descarga completada y guardada en tu biblioteca!");
            setLinkInput("");
        } else {
            showToast("error", "Error al descargar. Verifica el enlace e intenta de nuevo.");
        }
        setLinkDownloading(false);
    };

    const doSearch = async (term: string) => {
        setLoading(true);
        setHasSearched(true);
        setSearchTerm(term);
        setSearchError(false);
        try {
            const response = await fetch(
                `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=30`
            );
            const data = await response.json();
            setResults(data.results || []);
        } catch (error) {
            console.error("Error fetching from iTunes:", error);
            setSearchError(true);
            setResults([]);
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!query.trim()) return;
        doSearch(query.trim());
    };

    // Group results by album
    const albumGroups: AlbumGroup[] = [];
    const albumMap = new Map<string, AlbumGroup>();
    results.forEach(track => {
        if (track.collectionName) {
            const key = `${track.collectionName}||${track.artistName}`;
            if (!albumMap.has(key)) {
                albumMap.set(key, {
                    name: track.collectionName,
                    artist: track.artistName,
                    cover: track.artworkUrl100,
                    trackCount: 1,
                });
            } else {
                albumMap.get(key)!.trackCount++;
            }
        }
    });
    albumMap.forEach(v => albumGroups.push(v));

    const suggestions = ["Shakira", "Bad Bunny", "Peso Pluma", "Taylor Swift", "Dua Lipa", "Karol G"];

    return (
        <main className="p-4 md:p-8 max-w-7xl mx-auto">
            <header className="mb-10 text-center animate-fade-in-up">
                <h1 className="text-4xl font-bold mb-4">Buscar y Descargar</h1>
                <p className="text-gray-400">Encuentra o pega enlaces para obtener nueva música offline.</p>
            </header>

            <section className="glass-panel rounded-3xl p-6 md:p-8 mb-8 shadow-2xl flex flex-col gap-6">
                <form onSubmit={handleSearch} className="relative flex items-center w-full max-w-3xl mx-auto">
                    <div className="absolute left-4 text-gray-400"><Search size={24} /></div>
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Busca una canción, artista o álbum..."
                        className="w-full bg-slate-900/50 border border-slate-700 rounded-full py-4 pl-14 pr-32 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all text-lg"
                    />
                    <button
                        type="submit"
                        disabled={loading}
                        className="absolute right-2 top-2 bottom-2 bg-brand-600 hover:bg-brand-500 px-6 rounded-full font-medium transition-colors min-w-[100px]"
                    >
                        {loading ? <div className="h-5 w-5 border-2 border-white rounded-full animate-spin border-t-transparent mx-auto" /> : "Buscar"}
                    </button>
                </form>

                <div className="w-full max-w-3xl mx-auto flex items-center gap-4">
                    <div className="h-px bg-slate-700 flex-1"></div>
                    <span className="text-slate-500 text-sm font-medium">O pega un enlace</span>
                    <div className="h-px bg-slate-700 flex-1"></div>
                </div>

                <form onSubmit={handleLinkDownload} className="relative flex items-center w-full max-w-3xl mx-auto">
                    <input
                        type="text"
                        value={linkInput}
                        onChange={(e) => setLinkInput(e.target.value)}
                        disabled={linkDownloading}
                        placeholder="Pega enlace de YouTube, iTunes, etc..."
                        className="w-full bg-slate-900/50 border border-slate-700 rounded-full py-3 px-6 pr-36 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all text-base disabled:opacity-50"
                    />
                    <button
                        type="submit"
                        disabled={linkDownloading || !linkInput.trim()}
                        className="absolute right-2 top-2 bottom-2 bg-slate-700 hover:bg-slate-600 px-4 rounded-full font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:hover:bg-slate-700"
                    >
                        {linkDownloading ? (
                            <>
                                <div className="h-4 w-4 border-2 border-white rounded-full animate-spin border-t-transparent" />
                                <span className="text-sm">Descargando...</span>
                            </>
                        ) : (
                            <><Download size={18} /> Descargar</>
                        )}
                    </button>
                </form>

                {linkDownloading && (
                    <div className="w-full max-w-3xl mx-auto">
                        <div className="flex items-center gap-3 text-sm text-brand-400 mb-2">
                            <Loader size={16} className="animate-spin" />
                            <span>Descargando audio... esto puede tomar unos segundos</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-brand-600 to-brand-400 rounded-full animate-pulse" style={{ width: '70%', animation: 'progressPulse 2s ease-in-out infinite' }} />
                        </div>
                    </div>
                )}
            </section>

            {/* Loading State */}
            {loading && (
                <div className="flex flex-col items-center justify-center py-20 animate-fade-in-up">
                    <div className="relative">
                        <div className="w-16 h-16 border-4 border-brand-500/30 rounded-full"></div>
                        <div className="absolute inset-0 w-16 h-16 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                    <p className="text-slate-400 mt-6 text-lg font-medium">Buscando &quot;{query}&quot;...</p>
                    <p className="text-slate-500 text-sm mt-2">Explorando millones de canciones</p>
                </div>
            )}

            {/* No Results */}
            {!loading && hasSearched && results.length === 0 && !searchError && (
                <div className="flex flex-col items-center justify-center py-16 animate-fade-in-up">
                    <div className="relative mb-6">
                        <div className="w-24 h-24 rounded-full bg-slate-800/50 border border-slate-700/50 flex items-center justify-center animate-pulse-glow">
                            <SearchX size={40} className="text-slate-500" strokeWidth={1.5} />
                        </div>
                        <div className="absolute -top-2 -right-2 text-2xl animate-bounce" style={{ animationDelay: '0s', animationDuration: '2s' }}>🎵</div>
                        <div className="absolute -bottom-1 -left-3 text-xl animate-bounce" style={{ animationDelay: '0.5s', animationDuration: '2.5s' }}>🎶</div>
                        <div className="absolute top-0 -left-4 text-lg animate-bounce" style={{ animationDelay: '1s', animationDuration: '3s' }}>🎵</div>
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-2">No encontramos resultados</h3>
                    <p className="text-slate-400 text-center max-w-md mb-2">
                        No pudimos encontrar nada para <span className="text-brand-400 font-semibold">&quot;{searchTerm}&quot;</span>
                    </p>
                    <p className="text-slate-500 text-sm text-center max-w-md mb-8">
                        Intenta con otro nombre de canción, artista o álbum.
                    </p>
                    <div className="text-center">
                        <p className="text-slate-500 text-xs uppercase tracking-wider font-bold mb-3">Prueba buscando</p>
                        <div className="flex flex-wrap justify-center gap-2">
                            {suggestions.map((s) => (
                                <button key={s} onClick={() => { setQuery(s); doSearch(s); }}
                                    className="px-4 py-2 rounded-full bg-white/[0.05] border border-white/[0.08] text-slate-300 text-sm font-medium hover:bg-brand-500/20 hover:border-brand-500/30 hover:text-brand-400 transition-all">
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Error State */}
            {!loading && hasSearched && searchError && (
                <div className="flex flex-col items-center justify-center py-16 animate-fade-in-up">
                    <div className="w-20 h-20 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-6">
                        <XCircle size={36} className="text-red-400" />
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-2">Error de conexión</h3>
                    <p className="text-slate-400 text-center max-w-md mb-6">No pudimos conectar con el servidor de búsqueda.</p>
                    <button onClick={() => doSearch(searchTerm)}
                        className="flex items-center gap-2 px-6 py-3 rounded-full bg-brand-500 hover:bg-brand-600 text-white font-medium transition-all hover:scale-105">
                        <RefreshCw size={18} /> Reintentar
                    </button>
                </div>
            )}

            {/* Results with tabs: Songs / Albums */}
            {!loading && results.length > 0 && (
                <section className="animate-fade-in-up">
                    <div className="flex items-center justify-between mb-6">
                        <p className="text-slate-400 text-sm">
                            <span className="text-white font-semibold">{results.length}</span> resultados para <span className="text-brand-400 font-medium">&quot;{searchTerm}&quot;</span>
                        </p>
                        {/* View tabs */}
                        <div className="flex bg-white/[0.05] rounded-full p-1 border border-white/[0.08]">
                            <button onClick={() => setViewMode("songs")}
                                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${viewMode === "songs" ? "bg-brand-500 text-white shadow" : "text-slate-400 hover:text-white"}`}>
                                <Music size={14} className="inline mr-1.5" />Canciones
                            </button>
                            <button onClick={() => setViewMode("albums")}
                                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${viewMode === "albums" ? "bg-brand-500 text-white shadow" : "text-slate-400 hover:text-white"}`}>
                                <Disc3 size={14} className="inline mr-1.5" />Álbumes ({albumGroups.length})
                            </button>
                        </div>
                    </div>

                    {/* Songs View */}
                    {viewMode === "songs" && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {results.map((track) => {
                                const strId = track.trackId.toString();
                                const isDownloaded = savedTrackIds.has(strId);
                                const isDownloading = downloadingId === strId;

                                return (
                                    <div key={track.trackId} className="glass-panel rounded-2xl p-4 flex gap-4 items-center group hover:bg-white/[0.06] transition-all card-glow">
                                        <div className="relative h-16 w-16 flex-shrink-0 rounded-xl overflow-hidden shadow-lg bg-slate-800">
                                            <img src={track.artworkUrl100.replace("100x100", "200x200")} alt={track.trackName} className="w-full h-full object-cover" loading="lazy" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-[15px] font-bold text-white truncate" title={track.trackName}>{track.trackName}</h3>
                                            <p className="text-slate-400 text-sm truncate" title={track.artistName}>{track.artistName}</p>
                                            {track.collectionName && (
                                                <button
                                                    onClick={() => setAlbumModal({ open: true, album: track.collectionName, artist: track.artistName, cover: track.artworkUrl100 })}
                                                    className="text-slate-500 text-xs truncate mt-0.5 hover:text-brand-400 transition-colors flex items-center gap-1 group/album"
                                                >
                                                    <Disc3 size={10} className="group-hover/album:animate-spin" />
                                                    <span className="truncate">{track.collectionName}</span>
                                                </button>
                                            )}
                                        </div>
                                        <button
                                            className={`p-3 rounded-full transition-all flex-shrink-0 disabled:opacity-50 ${isDownloaded
                                                ? "bg-green-500/10 text-green-500"
                                                : "bg-brand-500/10 hover:bg-brand-500 text-brand-500 hover:text-white hover:scale-110 hover:shadow-lg hover:shadow-brand-500/20"
                                                }`}
                                            title={isDownloaded ? "Ya descargado" : "Descargar"}
                                            onClick={() => { if (!isDownloaded) handleDownload(track, null, strId); }}
                                            disabled={isDownloading || isDownloaded}
                                        >
                                            {isDownloading ? <div className="h-5 w-5 border-2 border-current border-t-transparent rounded-full animate-spin" /> : isDownloaded ? <Check size={20} /> : <Download size={20} />}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Albums View */}
                    {viewMode === "albums" && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                            {albumGroups.map((album, idx) => {
                                const cover = album.cover?.replace("100x100", "300x300") || "";
                                return (
                                    <button
                                        key={idx}
                                        onClick={() => setAlbumModal({ open: true, album: album.name, artist: album.artist, cover: album.cover })}
                                        className="bg-white/[0.03] hover:bg-white/[0.07] rounded-2xl p-4 text-left transition-all group card-glow"
                                    >
                                        <div className="w-full aspect-square rounded-xl overflow-hidden shadow-xl mb-3 bg-slate-800/50">
                                            {cover ? (
                                                <img src={cover} alt={album.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center">
                                                    <Disc3 size={40} className="text-slate-600" />
                                                </div>
                                            )}
                                        </div>
                                        <h3 className="text-white font-semibold text-sm truncate">{album.name}</h3>
                                        <p className="text-slate-400 text-xs truncate mt-0.5">{album.artist}</p>
                                        <p className="text-slate-500/60 text-[11px] mt-1">
                                            {album.trackCount} cancion{album.trackCount !== 1 ? "es" : ""} encontrada{album.trackCount !== 1 ? "s" : ""}
                                        </p>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </section>
            )}

            {/* Album Detail Modal */}
            <AlbumDetailModal
                isOpen={albumModal.open}
                onClose={() => setAlbumModal(prev => ({ ...prev, open: false }))}
                albumName={albumModal.album}
                artistName={albumModal.artist}
                coverUrl={albumModal.cover}
            />

            {/* Toast notifications */}
            <div className="fixed bottom-24 right-4 z-50 flex flex-col gap-3 pointer-events-none">
                {toasts.map((toast) => (
                    <div
                        key={toast.id}
                        className={`pointer-events-auto flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl backdrop-blur-xl border text-sm font-medium transition-all animate-slideIn ${toast.type === "success"
                            ? "bg-green-500/20 border-green-500/30 text-green-300"
                            : "bg-red-500/20 border-red-500/30 text-red-300"
                            }`}
                    >
                        {toast.type === "success" ? <CheckCircle size={20} /> : <XCircle size={20} />}
                        {toast.message}
                    </div>
                ))}
            </div>
        </main>
    );
}

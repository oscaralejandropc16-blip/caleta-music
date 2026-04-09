import React, { useState } from 'react';
import { X, CloudDownload, Loader } from 'lucide-react';
import { createPlaylist, addTrackToPlaylist, SavedTrack, saveTrackToDB } from '@/lib/db';
import { syncPlaylistToCloud } from '@/lib/syncLibrary';

export default function ImportSpotifyPlaylistModal({
    isOpen,
    onClose,
    onSuccess
}: {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const [link, setLink] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [progress, setProgress] = useState('');

    if (!isOpen) return null;

    const handleImport = async () => {
        if (!link.includes('spotify.com/playlist/')) {
            alert('Por favor, ingresa un enlace válido de playlist de Spotify.');
            return;
        }

        setIsLoading(true);
        try {
            setProgress('Obteniendo información de Spotify...');
            const res = await fetch(`/api/spotify-proxy?url=${encodeURIComponent(link)}`);
            if (!res.ok) throw new Error('Error al conectar con Spotify');

            const data = await res.json();
            if (data.error) throw new Error(data.error || 'Error de Spotify');

            const name = data.playlist?.name || data.playlist?.title || 'Playlist Importada';
            const description = data.playlist?.description || `Importada desde Spotify`;
            let coverBlob: Blob | undefined;

            const coverUrl = data.playlist?.coverArt?.sources?.[0]?.url;
            if (coverUrl) {
                try {
                    const imgRes = await fetch(coverUrl);
                    coverBlob = await imgRes.blob();
                } catch { }
            }

            setProgress(`Creando playlist "${name}"...`);
            const newPl = await createPlaylist(name, description, coverBlob);

            const tracks = data.tracks || [];
            setProgress(`Agregando ${tracks.length} canciones...`);

            for (let i = 0; i < tracks.length; i++) {
                const spTrack = tracks[i];
                // Guardar la pista superficialmente (como Favoritas) para que exista en DB
                // Extraer el ID de la URI "spotify:track:ID" o dejarlo aleatorio localmente
                const trackId = spTrack.uri ? spTrack.uri.split(':').pop() : `sp_${Date.now()}_${i}`;

                const newTrack: SavedTrack = {
                    id: trackId,
                    title: spTrack.name,
                    artist: spTrack.artist || 'Unknown Artist',
                    album: '',
                    coverUrl: coverUrl || '', // Fallback a la cover de playlist
                    previewUrl: spTrack.previewUrl || '',
                    streamUrl: '', // Se calculará con yt-dlp al reproducir si no hay API
                    downloadedAt: Date.now()
                };

                try {
                    await saveTrackToDB(newTrack);
                    await addTrackToPlaylist(newPl.id, newTrack.id);
                } catch (e) {
                    console.warn("Skip track", e);
                }

                if (i % 5 === 0) setProgress(`Agregando canciones... ${i}/${tracks.length}`);
            }

            setProgress('Sincronizando a la nube...');
            try {
                // Actualizar DB local
                const { getPlaylist } = await import('@/lib/db');
                const updated = await getPlaylist(newPl.id);
                if (updated) {
                    await syncPlaylistToCloud(updated);
                }
            } catch (e) {
                console.warn(e);
            }

            onSuccess();
            onClose();
        } catch (e: any) {
            alert('Error al importar: ' + e.message);
        } finally {
            setIsLoading(false);
            setProgress('');
            setLink('');
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-[#0a0f1e] border border-white/[0.1] rounded-[24px] w-full max-w-md p-6 shadow-2xl relative">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
                >
                    <X size={24} />
                </button>
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 bg-gradient-to-br from-green-500/20 to-green-500/5 rounded-full flex items-center justify-center border border-green-500/20">
                        <CloudDownload size={24} className="text-green-400" />
                    </div>
                    <h2 className="text-xl font-bold text-white">Importar de Spotify</h2>
                </div>

                <div className="mb-6">
                    <label className="block text-sm font-medium text-slate-300 mb-2">Enlace de la Playlist de Spotify</label>
                    <input
                        type="url"
                        value={link}
                        onChange={(e) => setLink(e.target.value)}
                        placeholder="ej. https://open.spotify.com/playlist/731MXX..."
                        className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 transition-colors"
                        disabled={isLoading}
                    />
                </div>

                {isLoading && (
                    <div className="flex items-center gap-3 mb-6 text-green-400 text-sm font-medium">
                        <Loader className="animate-spin" size={16} />
                        {progress}
                    </div>
                )}

                <div className="flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-5 py-2.5 rounded-full text-slate-300 hover:text-white hover:bg-white/[0.05] transition-colors font-medium text-sm"
                        disabled={isLoading}
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleImport}
                        disabled={isLoading || !link}
                        className="bg-green-500 hover:bg-green-400 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-full font-bold text-sm transition-colors shadow-lg shadow-green-500/25"
                    >
                        {isLoading ? 'Importando...' : 'Importar'}
                    </button>
                </div>
            </div>
        </div>
    );
}

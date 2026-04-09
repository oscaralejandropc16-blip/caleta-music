import React, { useState } from 'react';
import { X, CloudDownload, Loader } from 'lucide-react';
import { createPlaylist, addTrackToPlaylist, SavedTrack, saveTrackToDB } from '@/lib/db';
import { syncPlaylistToCloud } from '@/lib/syncLibrary';

export default function ImportDeezerPlaylistModal({
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
        if (!link.includes('deezer.com/playlist/') && !link.includes('deezer.com/es/playlist/')) {
            alert('Por favor, ingresa un enlace válido de playlist de Deezer.');
            return;
        }

        setIsLoading(true);
        try {
            // Extraer ID
            const matches = link.match(/playlist\/(\d+)/);
            if (!matches || !matches[1]) {
                alert('No se pudo encontrar el ID de la playlist.');
                setIsLoading(false);
                return;
            }
            const playlistId = matches[1];

            setProgress('Obteniendo información de Deezer...');
            const res = await fetch(`/api/deezer-proxy?endpoint=/playlist/${playlistId}`);
            if (!res.ok) throw new Error('Error al conectar con Deezer');

            const data = await res.json();
            if (data.error) throw new Error(data.error.message || 'Error de Deezer');

            const name = data.title || 'Playlist Importada';
            const description = data.description || `Importada desde Deezer`;
            let coverBlob: Blob | undefined;

            if (data.picture_xl || data.picture_medium) {
                try {
                    const imgRes = await fetch(data.picture_xl || data.picture_medium);
                    coverBlob = await imgRes.blob();
                } catch { }
            }

            setProgress(`Creando playlist "${name}"...`);
            const newPl = await createPlaylist(name, description, coverBlob);

            const tracks = data.tracks?.data || [];
            setProgress(`Agregando ${tracks.length} canciones...`);

            for (let i = 0; i < tracks.length; i++) {
                const dzTrack = tracks[i];
                // Guardar la pista superficialmente (como Favoritas) para que exista en DB
                const newTrack: SavedTrack = {
                    id: dzTrack.id.toString(),
                    title: dzTrack.title,
                    artist: dzTrack.artist?.name || 'Unknown Artist',
                    album: dzTrack.album?.title || '',
                    coverUrl: dzTrack.album?.cover_xl || dzTrack.album?.cover_medium || '',
                    previewUrl: dzTrack.preview,
                    streamUrl: `/api/deezer?id=${dzTrack.id}`, // Enlace original reference
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
                    <div className="w-12 h-12 bg-gradient-to-br from-brand-500/20 to-brand-500/5 rounded-full flex items-center justify-center border border-brand-500/20">
                        <CloudDownload size={24} className="text-brand-400" />
                    </div>
                    <h2 className="text-xl font-bold text-white">Importar de Deezer</h2>
                </div>

                <div className="mb-6">
                    <label className="block text-sm font-medium text-slate-300 mb-2">Enlace de la Playlist de Deezer</label>
                    <input
                        type="url"
                        value={link}
                        onChange={(e) => setLink(e.target.value)}
                        placeholder="ej. https://www.deezer.com/playlist/123456"
                        className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors"
                        disabled={isLoading}
                    />
                </div>

                {isLoading && (
                    <div className="flex items-center gap-3 mb-6 text-brand-400 text-sm font-medium">
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
                        className="bg-brand-500 hover:bg-brand-400 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-full font-bold text-sm transition-colors shadow-lg shadow-brand-500/25"
                    >
                        {isLoading ? 'Importando...' : 'Importar'}
                    </button>
                </div>
            </div>
        </div>
    );
}

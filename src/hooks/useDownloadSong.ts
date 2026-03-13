import { useState, useCallback } from 'react';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';
import { CapacitorHttp } from '@capacitor/core';

export interface SavedTrackMeta {
    id: string;
    title: string;
    artist: string;
    coverUrl: string;
    localPath: string; // Ruta interna tipo file:///
    downloadedAt: number;
}

export function useDownloadSong() {
    const [downloadingIds, setDownloadingIds] = useState<Record<string, boolean>>({});
    const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});

    const downloadSong = useCallback(async (
        trackParams: { id: string; title: string; artist: string; coverUrl: string; downloadUrl: string }
    ) => {
        const trackId = trackParams.id;
        try {
            setDownloadingIds(prev => ({ ...prev, [trackId]: true }));
            setDownloadProgress(prev => ({ ...prev, [trackId]: 0 }));

            // Crear sub-carpeta "caleta_music" en Directory.Data
            try {
                await Filesystem.mkdir({
                    path: 'caleta_music',
                    directory: Directory.Data,
                    recursive: true
                });
            } catch (e) {
                // Asumiremos que el directorio ya existe
            }

            const fileName = `caleta_music/track_${trackId}_${Date.now()}.mp3`;

            // Simular progreso de descarga
            const progressInterval = setInterval(() => {
                setDownloadProgress(prev => {
                    const current = prev[trackId] || 0;
                    if (current >= 90) return prev;
                    return { ...prev, [trackId]: current + 5 }; // Avanza de a 5%
                });
            }, 300);

            // Escribir el archivo MP3 físico dentro del teléfono del usuario
            const savedFile = await Filesystem.downloadFile({
                url: trackParams.downloadUrl,
                path: fileName,
                directory: Directory.Data,
            });

            // Obtener el URI completo para poder reproducirlo después
            const fileUri = await Filesystem.getUri({
                directory: Directory.Data,
                path: fileName
            });

            clearInterval(progressInterval);
            setDownloadProgress(prev => ({ ...prev, [trackId]: 95 }));

            // Crear el JSON con la metadata de la canción para uso sin conexión a internet
            const metadata: SavedTrackMeta = {
                id: trackId,
                title: trackParams.title,
                artist: trackParams.artist,
                coverUrl: trackParams.coverUrl,
                localPath: fileUri.uri, // Ruta nativa
                downloadedAt: Date.now(),
            };

            // Recuperar tracks previos y agregar el nuevo
            const prefData = await Preferences.get({ key: 'caleta_downloaded_tracks' });
            const currentTracks: SavedTrackMeta[] = prefData.value ? JSON.parse(prefData.value) : [];

            const filterExists = currentTracks.filter(t => t.id !== trackId);
            filterExists.push(metadata);

            await Preferences.set({
                key: 'caleta_downloaded_tracks',
                value: JSON.stringify(filterExists),
            });

            setDownloadProgress(prev => ({ ...prev, [trackId]: 100 }));
            return { success: true, localPath: fileUri.uri };

        } catch (error: any) {
            console.error('Error al descargar la canción:', error);
            return { success: false, error: error.message };
        } finally {
            setTimeout(() => {
                setDownloadingIds(prev => ({ ...prev, [trackId]: false }));
            }, 500);
        }
    }, []);

    const getDownloadedSongs = useCallback(async (): Promise<SavedTrackMeta[]> => {
        try {
            const { value } = await Preferences.get({ key: 'caleta_downloaded_tracks' });
            if (value) {
                return JSON.parse(value) as SavedTrackMeta[];
            }
            return [];
        } catch {
            return [];
        }
    }, []);

    return { downloadSong, downloadingIds, downloadProgress, getDownloadedSongs };
}

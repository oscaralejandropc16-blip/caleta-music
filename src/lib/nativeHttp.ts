import { CapacitorHttp } from '@capacitor/core';
import { Capacitor } from '@capacitor/core';

/**
 * Detecta si estamos corriendo en un entorno nativo (Android/iOS)
 * vs navegador web normal.
 */
const isNativePlatform = () => {
    try {
        return Capacitor.isNativePlatform();
    } catch {
        return false;
    }
};

export const MusicApiService = {
    // Petición GET: usa CapacitorHttp en nativo, fetch estándar en web
    async get(url: string, params?: Record<string, string>, headers?: Record<string, string>) {
        if (isNativePlatform()) {
            // Capacitor nativo: ignora CORS
            const options = {
                url,
                headers: headers || { 'Content-Type': 'application/json' },
                params: params || {},
            };
            const response = await CapacitorHttp.request({ ...options, method: 'GET' });
            return response.data;
        } else {
            // Navegador web: fetch estándar
            const urlObj = new URL(url);
            if (params) {
                Object.entries(params).forEach(([k, v]) => urlObj.searchParams.set(k, v));
            }
            const response = await fetch(urlObj.toString(), {
                headers: headers || {},
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        }
    },

    // Petición POST: usa CapacitorHttp en nativo, fetch estándar en web
    async post(url: string, data?: any, headers?: Record<string, string>) {
        if (isNativePlatform()) {
            const options = {
                url,
                headers: headers || { 'Content-Type': 'application/json' },
                data: data || {},
            };
            const response = await CapacitorHttp.request({ ...options, method: 'POST' });
            return response.data;
        } else {
            const response = await fetch(url, {
                method: 'POST',
                headers: headers || { 'Content-Type': 'application/json' },
                body: JSON.stringify(data || {}),
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        }
    }
};

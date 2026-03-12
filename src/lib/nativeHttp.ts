import { CapacitorHttp } from '@capacitor/core';

export const MusicApiService = {
    // Petición nativa GET (Ignorando CORS)
    async get(url: string, params?: Record<string, string>, headers?: Record<string, string>) {
        const options = {
            url,
            headers: headers || { 'Content-Type': 'application/json' },
            params: params || {},
        };

        const response = await CapacitorHttp.request({ ...options, method: 'GET' });
        return response.data;
    },

    // Petición nativa POST
    async post(url: string, data?: any, headers?: Record<string, string>) {
        const options = {
            url,
            headers: headers || { 'Content-Type': 'application/json' },
            data: data || {},
        };

        const response = await CapacitorHttp.request({ ...options, method: 'POST' });
        return response.data;
    }
};

import { NextResponse } from "next/server";

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const term = searchParams.get("term");
        if (!term) return NextResponse.json({ results: [] });

        // Deezer Public API es ultra rápida y no requiere autenticación para búsqueda básica
        const deezerUrl = `https://api.deezer.com/search?q=${encodeURIComponent(term)}&limit=30`;

        const response = await fetch(deezerUrl, {
            // Añadir abortController para un límite estricto de timeout (15 segundos)
            signal: AbortSignal.timeout(15000)
        });

        if (!response.ok) {
            throw new Error(`Deezer API returned ${response.status}`);
        }

        const data = await response.json();
        const deezerResults = data.data || [];

        // Mapear los resultados de Deezer a la interfaz ("ItunesTrack") que espera tu Frontend 
        // para no romper la UI de los componentes existentes
        const mappedResults = deezerResults.map((track: any) => ({
            wrapperType: "track",
            kind: "song",
            artistId: track.artist.id,
            collectionId: track.album.id,
            trackId: track.id,
            artistName: track.artist.name,
            collectionName: track.album.title,
            trackName: track.title,
            previewUrl: track.preview, // Segmento de 30s nativo de Deezer
            // Portadas en diferentes tamaños sacadas de la API oficial (vienen en 56, 250, 500 y 1000px)
            artworkUrl30: track.album.cover_small,
            artworkUrl60: track.album.cover_small,
            artworkUrl100: track.album.cover_medium,
            releaseDate: new Date().toISOString(), // Deezer no manda release date en /search simple
            trackTimeMillis: track.duration * 1000,
            primaryGenreName: "Música",
            isStreamable: true,
            _source: "deezer"
        }));

        // Deduplicate in case Deezer returns aliases
        const seen = new Set();
        const uniqueResults = mappedResults.filter((track: any) => {
            if (!track.trackName || !track.artistName) return false;
            // Clave única basada en Título + Artista normalizado
            const key = `${track.trackName.toLowerCase().replace(/[^a-z0-9]/g, '')}-${track.artistName.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        return NextResponse.json({ results: uniqueResults.slice(0, 30) });

    } catch (e: any) {
        console.error("Deezer search error:", e.message);
        // Fallback vacío si falla la API
        return NextResponse.json({ results: [] }, { status: 500 });
    }
}

import { NextResponse } from "next/server";
import yts from "yt-search";

// Helper to hash youtube ID to a number so we don't break existing interfaces expecting number
function hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash);
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const term = searchParams.get("term");
        if (!term) return NextResponse.json({ results: [] });

        const cleanTerm = term.replace(/ ft | ft\. | feat | feat\. | y | & | x | con /gi, " ").replace(/\s+/g, " ").trim();

        let itunesResults: any[] = [];
        try {
            const response = await fetch(
                `https://itunes.apple.com/search?term=${encodeURIComponent(cleanTerm)}&entity=song&limit=30`
            );
            const data = await response.json();
            itunesResults = data.results || [];
        } catch (e) {
            console.error("iTunes search failed:", e);
        }

        let ytMappedResults: any[] = [];
        try {
            const ytResponse = await yts(term);
            const ytVideos = ytResponse.videos.slice(0, 15);

            ytMappedResults = ytVideos.map(vid => {
                let artistName = vid.author.name;
                let trackName = vid.title;

                if (vid.title.includes("-")) {
                    const parts = vid.title.split("-");
                    artistName = parts[0].trim();
                    trackName = parts.slice(1).join("-").trim();
                }

                trackName = trackName.replace(/\[.*?\]|\(.*?\)|\|.*/g, "").trim();

                return {
                    wrapperType: "track",
                    kind: "song",
                    artistId: hashString(vid.author.url),
                    collectionId: hashString(vid.videoId + "collection"),
                    trackId: hashString(vid.videoId),
                    artistName: artistName,
                    collectionName: "YouTube Single",
                    trackName: trackName,
                    previewUrl: vid.url,
                    artworkUrl30: vid.thumbnail,
                    artworkUrl60: vid.thumbnail,
                    artworkUrl100: vid.thumbnail,
                    releaseDate: new Date().toISOString(),
                    trackTimeMillis: vid.duration.seconds * 1000,
                    primaryGenreName: "Alternativa",
                    isStreamable: true,
                    _isYoutubeFallback: true,
                    _youtubeId: vid.videoId
                };
            });
        } catch (e) {
            console.error("YouTube search failed:", e);
        }

        let finalResults: any[] = [];

        if (itunesResults.length < 2) {
            finalResults = [...ytMappedResults, ...itunesResults];
        } else {
            // Interleave best YouTube results into top of iTunes results
            finalResults = [...itunesResults];
            if (ytMappedResults.length > 0) finalResults.splice(1, 0, ytMappedResults[0]);
            if (ytMappedResults.length > 1) finalResults.splice(3, 0, ytMappedResults[1]);
            if (ytMappedResults.length > 2) finalResults.splice(6, 0, ytMappedResults[2]);
            if (ytMappedResults.length > 3) finalResults.splice(10, 0, ytMappedResults[3]);
            if (ytMappedResults.length > 4) finalResults.splice(15, 0, ytMappedResults[4]);
        }

        // Deduplicate
        const seen = new Set();
        const uniqueResults = finalResults.filter(track => {
            if (!track.trackName || !track.artistName) return false;
            const key = `${track.trackName.toLowerCase().replace(/[^a-z0-9]/g, '')}-${track.artistName.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        return NextResponse.json({ results: uniqueResults.slice(0, 30) });
    } catch (e) {
        console.error("Hybrid search error:", e);
        return NextResponse.json({ error: "Search failed" }, { status: 500 });
    }
}

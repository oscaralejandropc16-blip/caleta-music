import { NextRequest, NextResponse } from "next/server";

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * /api/youtube-resolve
 * 
 * Lightweight resolver that takes a YouTube video ID and returns:
 * - A direct Invidious `local=true` audio URL (proxied through Invidious's own residential IP)
 * - Video metadata (title, artist, cover)
 * 
 * The browser then fetches the audio DIRECTLY from Invidious, completely
 * bypassing all datacenter IP blocks from YouTube.
 */

const INVIDIOUS_INSTANCES = [
    "https://inv.thepixora.com",
    "https://inv.nadeko.net",
    "https://invidious.jing.rocks",
    "https://iv.datura.network",
    "https://invidious.nerdvpn.de",
    "https://invidious.privacyredirect.com",
    "https://invidious.lunar.icu",
    "https://invidious.protokolla.fi",
];

function withCors(response: NextResponse) {
    response.headers.set("Access-Control-Allow-Origin", "*");
    response.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "*");
    return response;
}

export async function OPTIONS() {
    return withCors(new NextResponse(null, { status: 204 }));
}

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const videoId = searchParams.get("id");
    const query = searchParams.get("q"); // search query fallback

    if (!videoId && !query) {
        return withCors(NextResponse.json({ error: "id or q param required" }, { status: 400 }));
    }

    // Dynamically fetch fresh instance list
    let instances = [...INVIDIOUS_INSTANCES];
    try {
        const iRes = await fetch("https://api.invidious.io/instances.json", { signal: AbortSignal.timeout(3000) });
        if (iRes.ok) {
            const list = await iRes.json();
            const fetched = list
                .filter((i: any) => i[1] && i[1].type === "https" && i[1].api)
                .map((i: any) => i[1].uri);
            if (fetched.length > 0) {
                // Prioritize known-good instances
                instances = ["https://inv.thepixora.com", ...fetched.filter((u: string) => u !== "https://inv.thepixora.com")];
            }
        }
    } catch { }

    // If we have a search query instead of a video ID, resolve it first
    let resolvedVideoId = videoId;

    if (!resolvedVideoId && query) {
        for (const instance of instances) {
            try {
                const searchRes = await fetch(
                    `${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=video&sort_by=relevance`,
                    { signal: AbortSignal.timeout(5000) }
                );
                if (!searchRes.ok) continue;
                const items = await searchRes.json();
                if (Array.isArray(items) && items.length > 0 && items[0].videoId) {
                    resolvedVideoId = items[0].videoId;
                    console.log(`[YT-Resolve] Search "${query}" -> ${resolvedVideoId} via ${instance}`);
                    break;
                }
            } catch { continue; }
        }

        if (!resolvedVideoId) {
            return withCors(NextResponse.json({ error: "No video found for query" }, { status: 404 }));
        }
    }

    // Now resolve audio URL from Invidious
    for (const instance of instances) {
        try {
            console.log(`[YT-Resolve] Trying ${instance} for video ${resolvedVideoId}`);
            const res = await fetch(
                `${instance}/api/v1/videos/${resolvedVideoId}`,
                { signal: AbortSignal.timeout(5000) }
            );
            if (!res.ok) continue;

            const data = await res.json();
            const audioStreams = (data.adaptiveFormats || []).filter((f: any) =>
                f.type?.startsWith("audio/") && f.url
            );

            if (audioStreams.length === 0) continue;

            // Pick best quality audio
            const best = [...audioStreams]
                .sort((a: any, b: any) => (parseInt(b.bitrate) || 0) - (parseInt(a.bitrate) || 0))[0];

            if (!best || !best.itag) continue;

            // Build the local=true URL that Invidious will proxy through its own residential IP
            const audioUrl = `${instance}/latest_version?id=${resolvedVideoId}&itag=${best.itag}&local=true`;
            const coverUrl = data.videoThumbnails?.[0]?.url || `https://i.ytimg.com/vi/${resolvedVideoId}/hqdefault.jpg`;

            console.log(`[YT-Resolve] ✅ Resolved via ${instance}: ${best.type} @ ${best.bitrate}bps`);

            return withCors(NextResponse.json({
                audioUrl,
                contentType: best.type?.split(";")[0] || "audio/mp4",
                title: data.title || "YouTube Audio",
                artist: data.author || "Desconocido",
                coverUrl,
                videoId: resolvedVideoId,
                instance,
            }));
        } catch (err: any) {
            console.warn(`[YT-Resolve] ${instance} failed: ${err.message}`);
            continue;
        }
    }

    // All instances failed - try noembed for at least metadata
    let fallbackTitle = "Enlace Descargado";
    let fallbackArtist = "Desconocido";
    if (resolvedVideoId) {
        try {
            const embedRes = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${resolvedVideoId}`, { signal: AbortSignal.timeout(3000) });
            if (embedRes.ok) {
                const embedData = await embedRes.json();
                if (embedData.title) {
                    fallbackTitle = embedData.title;
                    fallbackArtist = embedData.author_name || fallbackArtist;
                }
            }
        } catch { }
    }

    return withCors(NextResponse.json({
        error: "All Invidious instances failed to resolve audio",
        title: fallbackTitle,
        artist: fallbackArtist,
        videoId: resolvedVideoId,
    }, { status: 502 }));
}

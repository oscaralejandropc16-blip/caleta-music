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

    // FALLBACK 0: COBALT API (Most reliable right now)
    try {
        console.log(`[YT-Resolve] Trying COBALT API for video ${resolvedVideoId}`);
        // Default to a public instance, typically api.cobalt.tools or a community one
        const cobaltRes = await fetch("https://api.cobalt.tools/api/json", {
            method: "POST",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            },
            body: JSON.stringify({
                url: `https://www.youtube.com/watch?v=${resolvedVideoId}`,
                isAudioOnly: true,
                aFormat: "mp3",
                isAudioMuted: false
            }),
            signal: AbortSignal.timeout(8000)
        });

        if (cobaltRes.ok) {
            const cobaltData = await cobaltRes.json();
            if (cobaltData.status === "stream" || cobaltData.status === "redirect") {
                console.log(`[YT-Resolve] ✅ Resolved via COBALT API`);

                // Extraer metadatos básicos ya que Cobalt a veces no los da
                let title = "YouTube Audio";
                let artist = "Desconocido";
                try {
                    const embedRes = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${resolvedVideoId}`);
                    if (embedRes.ok) {
                        const embedData = await embedRes.json();
                        title = embedData.title || title;
                        artist = embedData.author_name || artist;
                    }
                } catch { }

                return withCors(NextResponse.json({
                    audioUrl: cobaltData.url,
                    contentType: "audio/mpeg", // we requested mp3
                    title,
                    artist,
                    coverUrl: `https://i.ytimg.com/vi/${resolvedVideoId}/hqdefault.jpg`,
                    videoId: resolvedVideoId,
                    instance: "https://api.cobalt.tools"
                }));
            }
        }
    } catch (err: any) {
        console.warn(`[YT-Resolve] COBALT API failed: ${err.message}`);
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

    // FALLBACK 1: PIPED API INSTANCES
    const PIPED_INSTANCES = [
        "https://pipedapi.kavin.rocks",
        "https://pipedapi.tokhmi.xyz",
        "https://api.piped.projectsegfau.lt",
        "https://pipedapi.smnz.de",
        "https://piped-api.garudalinux.org"
    ];

    for (const instance of PIPED_INSTANCES) {
        try {
            console.log(`[YT-Resolve] Trying PIPED ${instance} for video ${resolvedVideoId}`);
            const res = await fetch(`${instance}/streams/${resolvedVideoId}`, { signal: AbortSignal.timeout(6000) });
            if (!res.ok) continue;

            const data = await res.json();
            if (!data.audioStreams || data.audioStreams.length === 0) continue;

            const bestAudio = data.audioStreams.sort((a: any, b: any) => b.bitrate - a.bitrate)[0];
            if (!bestAudio || !bestAudio.url) continue;

            console.log(`[YT-Resolve] ✅ Resolved via PIPED ${instance}`);
            return withCors(NextResponse.json({
                audioUrl: bestAudio.url,
                contentType: bestAudio.mimeType || "audio/mp4",
                title: data.title || "YouTube Audio",
                artist: data.uploader || "Desconocido",
                coverUrl: data.thumbnailUrl || `https://i.ytimg.com/vi/${resolvedVideoId}/hqdefault.jpg`,
                videoId: resolvedVideoId,
                instance
            }));
        } catch (err: any) {
            console.warn(`[YT-Resolve] PIPED ${instance} failed: ${err.message}`);
        }
    }

    // FALLBACK 2: DEEZER NATIVE FALLBACK (Most reliable way to get music directly)
    // If all proxy methods fail, we extract the YT title via noembed and fetch the audio from Deezer!
    let fallbackTitle = "Enlace Descargado";
    let fallbackArtist = "Desconocido";
    let fallbackCoverUrl = `https://i.ytimg.com/vi/${resolvedVideoId}/hqdefault.jpg`;

    if (resolvedVideoId) {
        try {
            console.log(`[YT-Resolve] Trying DEEZER FALLBACK for video ${resolvedVideoId}`);
            // 1. Get exact video title from YouTube Noembed
            const embedRes = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${resolvedVideoId}`, { signal: AbortSignal.timeout(3000) });

            if (embedRes.ok) {
                const embedData = await embedRes.json();
                if (embedData.title) {
                    fallbackTitle = embedData.title;
                    fallbackArtist = embedData.author_name || fallbackArtist;
                    fallbackCoverUrl = embedData.thumbnail_url || fallbackCoverUrl;

                    // Cleanup title (remove 'Official Video', 'Lyrics', etc.)
                    const cleanTitle = fallbackTitle
                        .replace(/(\(|\[).*?(official|lyric|video|audio).*?(\)|\])/gi, '')
                        .replace(/ft\..*/gi, '')
                        .trim();

                    // 2. Search Deezer natively
                    const hostUrl = request.headers.get('host');
                    const proto = request.headers.get('x-forwarded-proto') || 'http';
                    const dRes = await fetch(`${proto}://${hostUrl}/api/deezer-search?q=${encodeURIComponent(cleanTitle + ' ' + fallbackArtist)}`, { signal: AbortSignal.timeout(4000) });

                    if (dRes.ok) {
                        const dData = await dRes.json();
                        if (dData.data && dData.data.length > 0) {
                            const bestMatch = dData.data[0];
                            console.log(`[YT-Resolve] ✅ Resolved via DEEZER FALLBACK: ID ${bestMatch.id}`);
                            return withCors(NextResponse.json({
                                audioUrl: `${proto}://${hostUrl}/api/deezer?id=${bestMatch.id}`,
                                contentType: "audio/mpeg",
                                title: fallbackTitle,
                                artist: fallbackArtist,
                                coverUrl: fallbackCoverUrl,
                                videoId: resolvedVideoId,
                                instance: "Deezer Hybrid Fallback"
                            }));
                        }
                    }
                }
            }
        } catch (err: any) {
            console.warn(`[YT-Resolve] DEEZER FALLBACK failed: ${err.message}`);
        }
    }

    return withCors(NextResponse.json({
        error: "All Invidious, Piped and Deezer fallbacks failed to resolve audio",
        title: fallbackTitle,
        artist: fallbackArtist,
        videoId: resolvedVideoId,
    }, { status: 502 }));
}

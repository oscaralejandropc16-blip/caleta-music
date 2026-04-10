import { NextRequest, NextResponse } from "next/server";

export const runtime = 'nodejs';

const INVIDIOUS_INSTANCES = [
    "https://invidious.jing.rocks",
    "https://inv.nadeko.net",
    "https://invidious.nerdvpn.de",
    "https://inv.thepixora.com",
    "https://invidious.lunar.icu"
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
    const listId = request.nextUrl.searchParams.get("list");
    if (!listId) return withCors(NextResponse.json({ error: "list param required" }, { status: 400 }));

    for (const instance of INVIDIOUS_INSTANCES) {
        try {
            console.log(`[YT-Playlist] Trying ${instance} for playlist ${listId}`);
            const res = await fetch(`${instance}/api/v1/playlists/${listId}`, { signal: AbortSignal.timeout(5000) });
            if (!res.ok) continue;

            const data = await res.json();
            if (data && data.videos && data.videos.length > 0) {
                return withCors(NextResponse.json({
                    title: data.title || "YouTube Playlist",
                    description: data.description || "",
                    author: data.author || "YouTube",
                    coverUrl: data.playlistThumbnails?.[0]?.url || data.videos[0]?.videoThumbnails?.[0]?.url || `https://i.ytimg.com/vi/${data.videos[0].videoId}/hqdefault.jpg`,
                    videos: data.videos.map((v: any) => ({
                        videoId: v.videoId,
                        title: v.title,
                        author: v.author,
                        lengthSeconds: v.lengthSeconds
                    }))
                }));
            }
        } catch { }
    }

    // Try dummy-json piped proxy
    const PIPED_INSTANCES = [
        "https://pipedapi.kavin.rocks",
        "https://pipedapi.tokhmi.xyz",
        "https://api.piped.projectsegfau.lt"
    ];

    for (const instance of PIPED_INSTANCES) {
        try {
            console.log(`[YT-Playlist] Trying PIPED ${instance} for playlist ${listId}`);
            const res = await fetch(`${instance}/playlists/${listId}`, { signal: AbortSignal.timeout(5000) });
            if (!res.ok) continue;

            const data = await res.json();
            if (data && data.relatedStreams && data.relatedStreams.length > 0) {
                return withCors(NextResponse.json({
                    title: data.name || "YouTube Playlist",
                    description: data.description || "",
                    author: data.uploader || "YouTube",
                    coverUrl: data.thumbnailUrl || `https://i.ytimg.com/vi/${data.relatedStreams[0].url.split('v=')[1]?.split('&')[0]}/hqdefault.jpg`,
                    videos: data.relatedStreams.map((v: any) => ({
                        videoId: v.url.split('v=')[1]?.split('&')[0],
                        title: v.title,
                        author: v.uploaderName || v.uploader,
                        lengthSeconds: v.duration
                    }))
                }));
            }
        } catch { }
    }

    return withCors(NextResponse.json({ error: "Failed to fetch playlist" }, { status: 502 }));
}

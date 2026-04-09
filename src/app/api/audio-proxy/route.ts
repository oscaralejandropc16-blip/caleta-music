import { NextRequest, NextResponse } from "next/server";

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * /api/audio-proxy
 * 
 * Ultra-lightweight CORS proxy that pipes audio from Invidious to the browser.
 * Vercel talks to Invidious (NOT YouTube), so no datacenter blocking.
 * Invidious with local=true proxies YouTube audio through its own residential IP.
 */

function withCors(response: NextResponse) {
    response.headers.set("Access-Control-Allow-Origin", "*");
    response.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "*");
    response.headers.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Content-Type, X-Video-Title, X-Video-Artist, X-Video-Cover");
    return response;
}

export async function OPTIONS() {
    return withCors(new NextResponse(null, { status: 204 }));
}

export async function GET(request: NextRequest) {
    const audioUrl = request.nextUrl.searchParams.get("url");
    const title = request.nextUrl.searchParams.get("title") || "Enlace Descargado";
    const artist = request.nextUrl.searchParams.get("artist") || "Desconocido";
    const cover = request.nextUrl.searchParams.get("cover") || "";

    if (!audioUrl) {
        return withCors(NextResponse.json({ error: "url param required" }, { status: 400 }));
    }

    // Only allow Invidious URLs for security
    const allowed = audioUrl.includes("invidious") || audioUrl.includes("inv.") || audioUrl.includes("iv.");
    if (!allowed) {
        return withCors(NextResponse.json({ error: "Only Invidious URLs allowed" }, { status: 403 }));
    }

    try {
        console.log(`[AudioProxy] Proxying: ${audioUrl.substring(0, 80)}...`);

        const fetchHeaders: Record<string, string> = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        };

        const rangeHeader = request.headers.get("range");
        if (rangeHeader) {
            fetchHeaders["Range"] = rangeHeader;
        }

        const streamRes = await fetch(audioUrl, {
            headers: fetchHeaders,
            signal: AbortSignal.timeout(30000),
        });

        if (!streamRes.ok && streamRes.status !== 206) {
            console.error(`[AudioProxy] Upstream returned ${streamRes.status}`);
            return withCors(NextResponse.json({ error: `Upstream ${streamRes.status}` }, { status: 502 }));
        }

        const responseHeaders: Record<string, string> = {
            "Content-Type": streamRes.headers.get("Content-Type") || "audio/mp4",
            "Accept-Ranges": "bytes",
            "X-Video-Title": encodeURIComponent(title),
            "X-Video-Artist": encodeURIComponent(artist),
            "X-Video-Cover": cover,
        };

        const contentLength = streamRes.headers.get("Content-Length");
        if (contentLength) responseHeaders["Content-Length"] = contentLength;

        const contentRange = streamRes.headers.get("Content-Range");
        if (contentRange) responseHeaders["Content-Range"] = contentRange;

        const response = new NextResponse(streamRes.body, {
            status: streamRes.status === 206 ? 206 : 200,
            headers: responseHeaders,
        });

        return withCors(response);
    } catch (err: any) {
        console.error(`[AudioProxy] Error: ${err.message}`);
        return withCors(NextResponse.json({ error: err.message }, { status: 500 }));
    }
}

import { NextResponse } from "next/server";

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const endpoint = searchParams.get("endpoint"); // e.g. /search/album?q=... or /album/12345

        if (!endpoint) {
            return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
        }

        const url = `https://api.deezer.com${endpoint}`;

        const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (!res.ok) {
            throw new Error(`Deezer API error: ${res.status}`);
        }

        const data = await res.json();
        return NextResponse.json(data);
    } catch (e: any) {
        console.error("Deezer proxy error:", e.message);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

import { NextResponse } from "next/server";
const getSpotifyInfo = require("spotify-url-info")(fetch);

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const url = searchParams.get("url");

        if (!url || !url.includes("spotify.com")) {
            return NextResponse.json({ error: "Missing or invalid Spotify URL" }, { status: 400 });
        }

        const data = await getSpotifyInfo.getData(url);
        const tracks = await getSpotifyInfo.getTracks(url);

        return NextResponse.json({ playlist: data, tracks });
    } catch (e: any) {
        console.error("Spotify proxy error:", e.message);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

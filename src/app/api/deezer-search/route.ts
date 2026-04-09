import { NextRequest, NextResponse } from "next/server";

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
    const query = searchParams.get("q");

    if (!query) {
        return withCors(NextResponse.json({ error: "No query provided" }, { status: 400 }));
    }

    try {
        const res = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=30`, {
            signal: AbortSignal.timeout(10000)
        });

        if (!res.ok) throw new Error("Deezer API error");

        const data = await res.json();
        return withCors(NextResponse.json(data));
    } catch (err: any) {
        return withCors(NextResponse.json({ error: err.message }, { status: 500 }));
    }
}

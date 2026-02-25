import { NextRequest, NextResponse } from "next/server";
import * as dfi from "d-fi-core";
import fs from "fs";
import crypto from "crypto";

export const runtime = 'nodejs';
export const maxDuration = 60;

const md5 = (data: string) => crypto.createHash('md5').update(data).digest('hex');

const getBlowfishKey = (trackId: string) => {
    const SECRET = 'g4el58wc' + '0zvf9na1';
    const idMd5 = md5(trackId);
    let bfKey = '';
    for (let i = 0; i < 16; i++) {
        bfKey += String.fromCharCode(idMd5.charCodeAt(i) ^ idMd5.charCodeAt(i + 16) ^ SECRET.charCodeAt(i));
    }
    return bfKey;
};

const decryptChunk = (chunk: Buffer, blowFishKey: string) => {
    const cipher = crypto.createDecipheriv('bf-cbc', blowFishKey, Buffer.from([0, 1, 2, 3, 4, 5, 6, 7]));
    cipher.setAutoPadding(false);
    return Buffer.concat([cipher.update(chunk), cipher.final()]);
};

let isDeezerInitialized = false;
let lastInitTime = 0;

// The ARL passed by the user
const DEEZER_ARL = process.env.DEEZER_ARL || "ee974bbd9ccb632b067cb6e2406a60cd9f0bd782d7f62f2a3d8448a63010c92658cb84d0f46721294621af6c326cdce2cd7260c324fcc97604ef79dd9a96de88eff778d36668bd61d77a0d8de9beca82a93c7c1f8a676c67100838e612aa46cd";

// Re-init every 15 minutes in case ARL session expired in-memory
const REINIT_INTERVAL_MS = 15 * 60 * 1000;

async function initializeDeezer(forceReinit = false) {
    const now = Date.now();
    if (!isDeezerInitialized || forceReinit || (now - lastInitTime > REINIT_INTERVAL_MS)) {
        console.log("[Deezer] Initializing d-fi-core with ARL... (force:", forceReinit, ")");
        try {
            await dfi.initDeezerApi(DEEZER_ARL);
            isDeezerInitialized = true;
            lastInitTime = now;
            console.log("[Deezer] Initialization successful");
        } catch (initErr: any) {
            isDeezerInitialized = false;
            console.error("[Deezer] Initialization FAILED:", initErr.message);
            throw new Error("Deezer authentication failed. ARL may be expired.");
        }
    }
}

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    let trackId = searchParams.get("id");
    const title = searchParams.get("title");
    const artist = searchParams.get("artist");

    if (!trackId && (!title || !artist)) {
        return NextResponse.json({ error: "No track ID or title/artist provided" }, { status: 400 });
    }

    try {
        await initializeDeezer();

        // Si NO tenemos ID, buscamos por texto. Si SÍ tenemos ID, saltamos directo a la canción (Velocidad luz)
        if (!trackId) {
            console.log(`[Deezer] Searching for: ${artist} - ${title}`);
            const searchObj = await dfi.searchMusic(`${artist} ${title}`);
            if (searchObj && searchObj.TRACK && searchObj.TRACK.data && searchObj.TRACK.data.length > 0) {
                trackId = searchObj.TRACK.data[0].SNG_ID;
                console.log(`[Deezer] Found fallback track ID: ${trackId}`);
            } else {
                return NextResponse.json({ error: "Track not found on Deezer" }, { status: 404 });
            }
        }

        console.log(`[Deezer] Fetching track info for ID: ${trackId}`);
        const track = await dfi.getTrackInfo(trackId as string);

        if (!track || !track.SNG_TITLE) {
            return NextResponse.json({ error: "Track not found" }, { status: 404 });
        }

        // 9 = 320kbps, 3 = 128kbps, 1 = FLAC
        // We request 320kbps, library will fallback to 128kbps if needed
        const trackUrlRes = await dfi.getTrackDownloadUrl(track, 9);
        if (!trackUrlRes || !trackUrlRes.trackUrl) {
            return NextResponse.json({ error: "Could not get stream URL" }, { status: 500 });
        }

        console.log(`[Deezer] Streaming encrypted file from Deezer CDN...`);
        const response = await fetch(trackUrlRes.trackUrl);
        if (!response.ok || !response.body) {
            throw new Error(`Failed to fetch from Deezer CDN: ${response.status}`);
        }

        const blowFishKey = getBlowfishKey(track.SNG_ID);
        const reader = response.body.getReader();
        const contentLength = response.headers.get("Content-Length");

        const stream = new ReadableStream({
            async start(controller) {
                let i = 0;
                let remainder = Buffer.alloc(0);

                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) {
                            if (remainder.length > 0) {
                                controller.enqueue(remainder);
                            }
                            controller.close();
                            break;
                        }

                        let buffer = remainder.length > 0 ? Buffer.concat([remainder, Buffer.from(value)]) : Buffer.from(value);

                        let offset = 0;
                        while (offset + 2048 <= buffer.length) {
                            const chunkToProcess = buffer.subarray(offset, offset + 2048);
                            if (i % 3 === 0) {
                                controller.enqueue(decryptChunk(chunkToProcess, blowFishKey));
                            } else {
                                controller.enqueue(chunkToProcess);
                            }
                            offset += 2048;
                            i++;
                        }

                        remainder = buffer.subarray(offset);
                    }
                } catch (err) {
                    controller.error(err);
                }
            }
        });

        const coverUrl = `https://e-cdns-images.dzcdn.net/images/cover/${track.ALB_PICTURE}/500x500-000000-80-0-0.jpg`;
        const artistName = track.ART_NAME || "Desconocido";
        const trackTitle = track.SNG_TITLE || "Enlace Descargado";

        const headers: Record<string, string> = {
            "Content-Type": "audio/mpeg",
            "X-Video-Title": encodeURIComponent(trackTitle),
            "X-Video-Artist": encodeURIComponent(artistName),
            "X-Video-Cover": coverUrl,
            "Access-Control-Expose-Headers": "X-Video-Title, X-Video-Artist, X-Video-Cover, Content-Length",
        };

        if (contentLength) {
            headers["Content-Length"] = contentLength;
        }

        return new NextResponse(stream, {
            status: 200,
            headers,
        });

    } catch (error: any) {
        console.error("[Deezer Downloader] Error:", error.message);

        // Si falla, marcar como no-inicializado para que el próximo request re-autentique
        isDeezerInitialized = false;

        return NextResponse.json(
            { error: error.message || "Failed to process Deezer download" },
            { status: 500 }
        );
    }
}

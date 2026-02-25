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

// Blowfish en JavaScript puro - funciona en CUALQUIER versión de Node.js
// (OpenSSL 3.0 en Node 17+ no soporta bf-cbc)
// @ts-ignore
import { Blowfish } from 'egoroof-blowfish';

const decryptChunk = (chunk: Buffer, blowFishKey: string) => {
    const bf = new Blowfish(blowFishKey, Blowfish.MODE.CBC, Blowfish.PADDING.NULL);
    bf.setIv(Buffer.from([0, 1, 2, 3, 4, 5, 6, 7]));
    const decrypted = bf.decode(chunk, Blowfish.TYPE.UINT8_ARRAY);
    return Buffer.from(decrypted);
};

let isDeezerInitialized = false;
let lastInitTime = 0;

// The ARL passed by the user
const DEEZER_ARL = process.env.DEEZER_ARL || "3852504531ee9ab73064ee5dde805831b030f72338fe8f15a63288851f44a8863e17023e7b60ecd2df93dfa5e5879af85b50874d4cfde64ce586b5088653c8878a27848219fb1dbcac2e3a1b55307764288d9427eb7c5bde148718fa8834ec08";

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
        const arrayBuffer = await response.arrayBuffer();
        const encryptedBuffer = Buffer.from(arrayBuffer);

        const chunks: Buffer[] = [];
        let offset = 0;
        let i = 0;

        while (offset + 2048 <= encryptedBuffer.length) {
            const chunkToProcess = encryptedBuffer.subarray(offset, offset + 2048);
            if (i % 3 === 0) {
                chunks.push(decryptChunk(chunkToProcess, blowFishKey));
            } else {
                chunks.push(chunkToProcess);
            }
            offset += 2048;
            i++;
        }

        const remainder = encryptedBuffer.subarray(offset);
        if (remainder.length > 0) {
            chunks.push(remainder);
        }

        const decryptedBuffer = Buffer.concat(chunks);

        const totalSize = decryptedBuffer.length;
        const rangeHeader = request.headers.get("range");

        const coverUrl = `https://e-cdns-images.dzcdn.net/images/cover/${track.ALB_PICTURE}/500x500-000000-80-0-0.jpg`;
        const artistName = track.ART_NAME || "Desconocido";
        const trackTitle = track.SNG_TITLE || "Enlace Descargado";

        const baseHeaders: Record<string, string> = {
            "Content-Type": "audio/mpeg",
            "Accept-Ranges": "bytes",
            "X-Video-Title": encodeURIComponent(trackTitle),
            "X-Video-Artist": encodeURIComponent(artistName),
            "X-Video-Cover": coverUrl,
            "Access-Control-Expose-Headers": "X-Video-Title, X-Video-Artist, X-Video-Cover, Content-Length",
        };

        if (rangeHeader) {
            const parts = rangeHeader.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
            const chunksize = (end - start) + 1;

            const slicedBuffer = decryptedBuffer.subarray(start, end + 1);

            return new NextResponse(slicedBuffer, {
                status: 206,
                headers: {
                    ...baseHeaders,
                    "Content-Range": `bytes ${start}-${end}/${totalSize}`,
                    "Content-Length": chunksize.toString(),
                },
            });
        }

        return new NextResponse(decryptedBuffer, {
            status: 200,
            headers: {
                ...baseHeaders,
                "Content-Length": totalSize.toString()
            },
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

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import { execFile } from "child_process";

export const runtime = 'nodejs';
export const maxDuration = 60;

const md5 = (data: string | number) => crypto.createHash('md5').update(data.toString()).digest('hex');

const getBlowfishKey = (trackId: string | number) => {
    const SECRET = 'g4el58wc' + '0zvf9na1';
    const idMd5 = md5(trackId.toString());
    let bfKey = '';
    for (let i = 0; i < 16; i++) {
        bfKey += String.fromCharCode(idMd5.charCodeAt(i) ^ idMd5.charCodeAt(i + 16) ^ SECRET.charCodeAt(i));
    }
    return bfKey;
};

// @ts-ignore
import { Blowfish } from 'egoroof-blowfish';

const decryptChunk = (chunk: Buffer, blowFishKey: string) => {
    const bf = new Blowfish(blowFishKey, Blowfish.MODE.CBC, Blowfish.PADDING.NULL);
    bf.setIv(Buffer.from([0, 1, 2, 3, 4, 5, 6, 7]));
    const decrypted = bf.decode(chunk, Blowfish.TYPE.UINT8_ARRAY);

    // egoroof-blowfish PADDING.NULL strips trailing 0x00 bytes upon decoding.
    // Audio stream frames may contain legitimate trailing zeroes.
    // This restores the chunk length natively without corrupting Content-Length offsets!
    const restored = Buffer.alloc(chunk.length, 0);
    Buffer.from(decrypted).copy(restored);
    return restored;
};

let isDeezerInitialized = false;
let lastInitTime = 0;

const DEEZER_ARL = process.env.DEEZER_ARL || "3852504531ee9ab73064ee5dde805831b030f72338fe8f15a63288851f44a8863e17023e7b60ecd2df93dfa5e5879af85b50874d4cfde64ce586b5088653c8878a27848219fb1dbcac2e3a1b55307764288d9427eb7c5bde148718fa8834ec08";
const REINIT_INTERVAL_MS = 15 * 60 * 1000;




// ============== DEEZER CORE ==============

async function initializeDeezer(forceReinit = false) {
    const dfi = await import("d-fi-core");
    const now = Date.now();
    if (!isDeezerInitialized || forceReinit || (now - lastInitTime > REINIT_INTERVAL_MS)) {
        const arlToUse = (process.env.DEEZER_ARL || DEEZER_ARL).trim();
        console.log("[Deezer] Initializing with ARL prefix:", arlToUse.substring(0, 15) + "...");
        try {
            await dfi.initDeezerApi(arlToUse);
            isDeezerInitialized = true;
            lastInitTime = now;
            console.log("[Deezer] Initialization successful");
        } catch (e: any) {
            console.error("[Deezer] Failed to initialize API:", e.message);
            throw e;
        }
    }
    return dfi;
}

async function streamFromDeezer(request: NextRequest, trackId: string | null, title: string | null, artist: string | null): Promise<NextResponse> {
    const dfi = await initializeDeezer();

    // Si el ID es negativo o falso, lo ignoramos para forzar búsqueda por nombre (pasa con IDs locales cacheados viejos)
    if (trackId && parseInt(trackId, 10) < 0) {
        console.warn(`[Deezer] Ignoring fake/negative track ID: ${trackId}`);
        trackId = null;
    }

    // Si NO tenemos ID, buscamos por texto
    if (!trackId) {
        console.log(`[Deezer] Searching for: ${artist} - ${title}`);
        let foundId: string | null = null;

        try {
            const searchObj = await dfi.searchMusic(`${artist} ${title}`);
            if (searchObj?.TRACK?.data?.length > 0) {
                foundId = searchObj.TRACK.data[0].SNG_ID.toString();
            }
        } catch (e) {
            console.warn(`[Deezer] dfi.searchMusic error for ${title}:`, e);
        }

        // Si la búsqueda interna falla (ej. por caracteres especiales), usamos la API pública que es más robusta
        if (!foundId) {
            try {
                const searchStr = encodeURIComponent(`${title} ${artist}`.trim());
                const res = await fetch(`https://api.deezer.com/search?q=${searchStr}&limit=1`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.data && data.data.length > 0) {
                        foundId = data.data[0].id.toString();
                        console.log(`[Deezer] Found track ID via public api: ${foundId}`);
                    }
                }
            } catch (e) {
                console.warn(`[Deezer] public api search error for ${title}:`, e);
            }
        }

        if (foundId) {
            trackId = foundId;
            console.log(`[Deezer] Found valid track ID: ${trackId}`);
        } else {
            console.error(`[Deezer] Track totally not found on Deezer: ${title} - ${artist}`);
            throw new Error("Track not found on Deezer");
        }
    }

    console.log(`[Deezer] Fetching track info for ID: ${trackId}`);
    const track = await dfi.getTrackInfo(trackId as string);

    if (!track || !track.SNG_TITLE) {
        console.error("[Deezer] Track metadata missing or invalid:", track);
        throw new Error("Track metadata not found on Deezer");
    }

    console.log(`[Deezer] Track Info: ${track.ART_NAME} - ${track.SNG_TITLE} (ID: ${track.SNG_ID})`);

    // Intentar diferentes calidades: 1 (128kbps), 3 (320kbps), 9 (FLAC/320)
    // Priorizamos 1 porque es el más compatible con ARLs gratuitos/estándar
    let trackUrlRes = null;
    const qualities = [1, 3, 9];
    let lastError = "No stream found";

    for (const q of qualities) {
        try {
            console.log(`[Deezer] Trying quality format: ${q} for track ${trackId}`);
            trackUrlRes = await dfi.getTrackDownloadUrl(track, q);
            if (trackUrlRes && trackUrlRes.trackUrl) {
                console.log(`[Deezer] Success with quality: ${q}`);
                break;
            }
        } catch (e: any) {
            lastError = e.message;
            console.warn(`[Deezer] Quality ${q} failed:`, e.message);
        }
    }

    if (!trackUrlRes || !trackUrlRes.trackUrl) {
        console.warn("[Deezer] Full stream URL generation failed. Details:", { lastError, hasMedia: !!(track as any).MEDIA });
        // Fallback a preview si está disponible en la metadata
        const preview = (track as any).MEDIA?.find((m: any) => m.TYPE === 'preview')?.HREF || (track as any).PREVIEW;
        if (preview) {
            console.log("[Deezer] CDN stream failed, falling back to public preview URL:", preview);
            return NextResponse.redirect(new URL(preview));
        }
        throw new Error(`Could not get stream URL: ${lastError}`);
    }

    const trackDuration = parseInt(track.DURATION || '0', 10);
    console.log(`[Deezer] Streaming encrypted file from: ${trackUrlRes.trackUrl.substring(0, 50)}...`);

    const rangeHeader = request.headers.get("range");
    const fetchHeaders: Record<string, string> = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    };
    if (rangeHeader) {
        fetchHeaders["Range"] = rangeHeader;
    }

    const response = await fetch(trackUrlRes.trackUrl, { headers: fetchHeaders });
    if (!response.ok || !response.body) {
        throw new Error(`Failed to fetch from Deezer CDN: ${response.status}`);
    }

    const totalSize = parseInt(response.headers.get("content-length") || "0", 10);
    const contentRange = response.headers.get("content-range");


    const coverUrl = `https://e-cdns-images.dzcdn.net/images/cover/${track.ALB_PICTURE}/500x500-000000-80-0-0.jpg`;
    const artistName = track.ART_NAME || "Desconocido";
    const trackTitle = track.SNG_TITLE || "Enlace Descargado";

    const baseHeaders: Record<string, string> = {
        "Content-Type": "audio/mpeg",
        "Accept-Ranges": "bytes",
        "X-Video-Title": encodeURIComponent(trackTitle),
        "X-Video-Artist": encodeURIComponent(artistName),
        "X-Video-Cover": coverUrl,
        "Access-Control-Expose-Headers": "X-Video-Title, X-Video-Artist, X-Video-Cover, Content-Length, Content-Range",
    };

    if (totalSize > 0) baseHeaders["Content-Length"] = totalSize.toString();
    if (contentRange) baseHeaders["Content-Range"] = contentRange;


    const CHUNK_SIZE = 2048;
    const blowFishKey = getBlowfishKey(track.SNG_ID);
    const reader = response.body.getReader();

    const stream = new ReadableStream({
        async start(controller) {
            let buffer = Buffer.alloc(0);
            let currentByteIndex = 0;

            if (contentRange) {
                const match = contentRange.match(/bytes (\d+)-/);
                if (match) currentByteIndex = parseInt(match[1], 10);
            }

            try {
                // eslint-disable-next-line no-constant-condition
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) {
                        if (buffer.length > 0) controller.enqueue(new Uint8Array(buffer));
                        break;
                    }

                    buffer = Buffer.concat([buffer, Buffer.from(value)]);

                    while (buffer.length >= CHUNK_SIZE) {
                        const chunkToProcess = buffer.subarray(0, CHUNK_SIZE);
                        const chunkIndex = Math.floor(currentByteIndex / CHUNK_SIZE);

                        let processedChunk = chunkToProcess;
                        if (chunkIndex % 3 === 0) {
                            processedChunk = decryptChunk(chunkToProcess, blowFishKey);
                        }

                        controller.enqueue(new Uint8Array(processedChunk));
                        buffer = buffer.subarray(CHUNK_SIZE);
                        currentByteIndex += CHUNK_SIZE;
                    }
                }
            } catch (e) {
                console.error("ReadableStream error:", e);
                controller.error(e);
            } finally {
                controller.close();
                reader.cancel().catch(() => { });
            }
        },
        cancel() {
            reader.cancel().catch(() => { });
        }
    });

    return new NextResponse(stream, {
        status: response.status,
        headers: baseHeaders,
    });
}

// ============== MAIN HANDLER ==============

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const trackId = searchParams.get("id");
    const title = searchParams.get("title");
    const artist = searchParams.get("artist");

    if (!trackId && (!title || !artist)) {
        return NextResponse.json({ error: "No track ID or title/artist provided" }, { status: 400 });
    }

    let finalTitle = title;
    let finalArtist = artist;

    // ===== 1. Intentar Deezer =====
    try {
        console.log(`[Deezer] Requesting: ${trackId || title}`);
        return await streamFromDeezer(request, trackId, finalTitle, finalArtist);
    } catch (deezerErr: any) {
        console.error("[Deezer API Error]:", deezerErr.message);

        // Si es un error de licencia o ARL, intentamos re-inicializar una vez
        if (deezerErr.message.includes("License") || deezerErr.message.includes("ARL") || deezerErr.message.includes("token")) {
            try {
                console.log("[Deezer] Attempting forced re-initialization...");
                isDeezerInitialized = false; // Forzar re-inicialización
                return await streamFromDeezer(request, trackId, finalTitle, finalArtist);
            } catch (retryErr: any) {
                console.error("[Deezer API Retry Error]:", retryErr.message);
            }
        }

        return NextResponse.json(
            { error: `Deezer streaming failed: ${deezerErr.message}` },
            { status: 500 }
        );
    }
}

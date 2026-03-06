import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import { execFile } from "child_process";

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

const DEEZER_ARL = process.env.DEEZER_ARL || "3852504531ee9ab73064ee5dde805831b030f72338fe8f15a63288851f44a8863e17023e7b60ecd2df93dfa5e5879af85b50874d4cfde64ce586b5088653c8878a27848219fb1dbcac2e3a1b55307764288d9427eb7c5bde148718fa8834ec08";
const REINIT_INTERVAL_MS = 15 * 60 * 1000;




// ============== DEEZER CORE ==============

async function initializeDeezer(forceReinit = false) {
    const dfi = await import("d-fi-core");
    const now = Date.now();
    if (!isDeezerInitialized || forceReinit || (now - lastInitTime > REINIT_INTERVAL_MS)) {
        const arlToUse = process.env.DEEZER_ARL || DEEZER_ARL;
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

    // Si NO tenemos ID, buscamos por texto
    if (!trackId) {
        console.log(`[Deezer] Searching for: ${artist} - ${title}`);
        const searchObj = await dfi.searchMusic(`${artist} ${title}`);
        if (searchObj?.TRACK?.data?.length > 0) {
            trackId = searchObj.TRACK.data[0].SNG_ID;
            console.log(`[Deezer] Found track ID: ${trackId}`);
        } else {
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
    console.log(`[Deezer] Streaming encrypted file from Deezer CDN... (duration: ${trackDuration}s)`);
    const headRes = await fetch(trackUrlRes.trackUrl, { method: "HEAD" });
    const totalSize = parseInt(headRes.headers.get("content-length") || "0", 10);

    const rangeHeader = request.headers.get("range");
    let responseStart = 0;
    let responseEnd = totalSize > 0 ? totalSize - 1 : 0;
    let isPartial = false;

    if (rangeHeader && totalSize > 0) {
        const parts = rangeHeader.replace(/bytes=/, "").split("-");
        responseStart = parseInt(parts[0], 10) || 0;
        if (parts[1]) {
            responseEnd = parseInt(parts[1], 10);
        }
        if (responseEnd >= totalSize) responseEnd = totalSize - 1;
        isPartial = true;
    }

    const CHUNK_SIZE = 2048;
    const alignedStart = Math.floor(responseStart / CHUNK_SIZE) * CHUNK_SIZE;
    const alignedEnd = responseEnd === totalSize - 1 ? '' : (Math.ceil((responseEnd + 1) / CHUNK_SIZE) * CHUNK_SIZE - 1);

    const fetchHeaders: Record<string, string> = {};
    if (isPartial) {
        fetchHeaders["Range"] = `bytes=${alignedStart}-${alignedEnd !== '' ? alignedEnd : ''}`;
    }

    const response = await fetch(trackUrlRes.trackUrl, { headers: fetchHeaders });
    if (!response.ok || !response.body) {
        throw new Error(`Failed to fetch from Deezer CDN: ${response.status}`);
    }

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

    if (totalSize > 0) {
        if (isPartial) {
            baseHeaders["Content-Range"] = `bytes ${responseStart}-${responseEnd}/${totalSize}`;
            baseHeaders["Content-Length"] = (responseEnd - responseStart + 1).toString();
        } else {
            baseHeaders["Content-Length"] = totalSize.toString();
        }
    }

    const blowFishKey = getBlowfishKey(track.SNG_ID);
    const reader = response.body.getReader();

    let currentByteIndex = alignedStart;
    let bytesSentToClient = 0;
    const totalBytesToSend = responseEnd - responseStart + 1;

    const stream = new ReadableStream({
        async start(controller) {
            let buffer = Buffer.alloc(0);
            try {
                // eslint-disable-next-line no-constant-condition
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer = Buffer.concat([buffer, Buffer.from(value)]);

                    while (buffer.length >= CHUNK_SIZE) {
                        const chunkToProcess = buffer.subarray(0, CHUNK_SIZE);
                        const chunkIndex = Math.floor(currentByteIndex / CHUNK_SIZE);

                        let processedChunk = chunkToProcess;
                        if (chunkIndex % 3 === 0) {
                            processedChunk = decryptChunk(chunkToProcess, blowFishKey);
                        }

                        let sliceStart = 0;
                        if (currentByteIndex < responseStart) {
                            sliceStart = responseStart - currentByteIndex;
                        }

                        const actualSlice = processedChunk.subarray(sliceStart, CHUNK_SIZE);

                        const bytesRemaining = totalBytesToSend - bytesSentToClient;
                        if (actualSlice.length > bytesRemaining) {
                            controller.enqueue(new Uint8Array(actualSlice.subarray(0, bytesRemaining)));
                            bytesSentToClient += bytesRemaining;
                            break;
                        } else if (actualSlice.length > 0) {
                            controller.enqueue(new Uint8Array(actualSlice));
                            bytesSentToClient += actualSlice.length;
                        }

                        buffer = buffer.subarray(CHUNK_SIZE);
                        currentByteIndex += CHUNK_SIZE;
                        if (bytesSentToClient >= totalBytesToSend) break;
                    }
                    if (bytesSentToClient >= totalBytesToSend) break;
                }

                if (buffer.length > 0 && bytesSentToClient < totalBytesToSend) {
                    let sliceStart = 0;
                    if (currentByteIndex < responseStart) {
                        sliceStart = responseStart - currentByteIndex;
                    }
                    const actualSlice = buffer.subarray(sliceStart);
                    const bytesRemaining = totalBytesToSend - bytesSentToClient;
                    if (actualSlice.length > bytesRemaining) {
                        controller.enqueue(new Uint8Array(actualSlice.subarray(0, bytesRemaining)));
                    } else if (actualSlice.length > 0) {
                        controller.enqueue(new Uint8Array(actualSlice));
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
        status: isPartial ? 206 : 200,
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

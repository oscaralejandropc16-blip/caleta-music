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
        let trackUrlRes = await dfi.getTrackDownloadUrl(track, 9);
        if (!trackUrlRes || !trackUrlRes.trackUrl) {
            // Retry with 128kbps
            trackUrlRes = await dfi.getTrackDownloadUrl(track, 3);
            if (!trackUrlRes || !trackUrlRes.trackUrl) {
                return NextResponse.json({ error: "Could not get stream URL" }, { status: 500 });
            }
        }

        const trackDuration = parseInt(track.DURATION || '0', 10);
        console.log(`[Deezer] Streaming encrypted file from Deezer CDN... (duration: ${trackDuration}s)`);
        const response = await fetch(trackUrlRes.trackUrl);
        if (!response.ok || !response.body) {
            throw new Error(`Failed to fetch from Deezer CDN: ${response.status}`);
        }

        // Verificar Content-Length del CDN
        const expectedCdnLength = parseInt(response.headers.get('content-length') || '0', 10);

        const blowFishKey = getBlowfishKey(track.SNG_ID);
        const arrayBuffer = await response.arrayBuffer();
        const encryptedBuffer = Buffer.from(arrayBuffer);

        // Validar que el archivo no está truncado
        if (expectedCdnLength > 0 && encryptedBuffer.length < expectedCdnLength * 0.9) {
            console.error(`[Deezer] Incomplete CDN download: got ${encryptedBuffer.length} bytes, expected ${expectedCdnLength}`);
            throw new Error(`Incomplete download from Deezer CDN`);
        }

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

        // Validar tamaño vs duración esperada — mínimo ~8KB por segundo a 128kbps
        if (trackDuration > 30) {
            const minExpectedBytes = trackDuration * 8000; // ~50% de 128kbps
            if (decryptedBuffer.length < minExpectedBytes) {
                console.error(`[Deezer] File too small: ${decryptedBuffer.length} bytes for ${trackDuration}s track (min expected: ${minExpectedBytes})`);
                // No lanzar error, servir lo que tenemos pero loguear la advertencia
            }
        }

        console.log(`[Deezer] Decrypted ${decryptedBuffer.length} bytes (${(decryptedBuffer.length / 1024 / 1024).toFixed(1)}MB) for ${trackDuration}s track`);
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

        let responseStart = 0;
        let responseEnd = totalSize - 1;
        let isPartial = false;

        if (rangeHeader) {
            const parts = rangeHeader.replace(/bytes=/, "").split("-");
            responseStart = parseInt(parts[0], 10) || 0;
            if (parts[1]) {
                responseEnd = parseInt(parts[1], 10);
                if (isNaN(responseEnd)) {
                    responseEnd = totalSize - 1;
                }
            }
            if (responseEnd >= totalSize) responseEnd = totalSize - 1;
            isPartial = true;
        }

        const chunksize = (responseEnd - responseStart) + 1;
        const slicedBuffer = decryptedBuffer.subarray(responseStart, responseEnd + 1);

        // Crear ReadableStream usando pull para manejar la contrapresión y evitar cuelgues
        let streamOffset = 0;
        const chunkSize = 64 * 1024; // 64KB
        const stream = new ReadableStream({
            pull(controller) {
                if (streamOffset >= slicedBuffer.length) {
                    controller.close();
                    return;
                }
                const end = Math.min(streamOffset + chunkSize, slicedBuffer.length);
                const chunk = new Uint8Array(slicedBuffer.subarray(streamOffset, end));
                controller.enqueue(chunk);
                streamOffset = end;
            }
        });

        if (isPartial) {
            return new NextResponse(stream, {
                status: 206,
                headers: {
                    ...baseHeaders,
                    "Content-Range": `bytes ${responseStart}-${responseEnd}/${totalSize}`,
                    "Content-Length": chunksize.toString(),
                },
            });
        }

        return new NextResponse(stream, {
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

        // ===== FALLBACK: Si tenemos title/artist, intentar con YouTube (Piped/Invidious) =====
        // En vez de devolver error 500, redirigimos internamente al endpoint de download
        // para que el cliente reciba audio completo en vez del preview de 30s.
        if (title && artist) {
            console.log(`[Deezer] Falling back to YouTube via /api/download for: ${artist} - ${title}`);
            try {
                const baseUrl = request.nextUrl.origin || 'http://localhost:3000';
                const downloadUrl = `${baseUrl}/api/download?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`;
                const fallbackRes = await fetch(downloadUrl, { signal: AbortSignal.timeout(50000) });

                if (fallbackRes.ok) {
                    const contentType = fallbackRes.headers.get('content-type') || '';
                    if (contentType.includes('application/json')) {
                        // Vercel: Piped/Invidious devuelve JSON con audioUrl
                        const data = await fallbackRes.json();
                        return NextResponse.json(data);
                    } else {
                        // Local: devuelve binario de audio directo
                        const headers: Record<string, string> = {};
                        ['content-type', 'content-length', 'x-video-title', 'x-video-artist', 'x-video-cover', 'access-control-expose-headers'].forEach(h => {
                            const v = fallbackRes.headers.get(h);
                            if (v) headers[h] = v;
                        });
                        return new NextResponse(fallbackRes.body, { status: 200, headers });
                    }
                }
            } catch (fallbackErr: any) {
                console.error("[Deezer] YouTube fallback also failed:", fallbackErr.message);
            }
        }

        return NextResponse.json(
            { error: error.message || "Failed to process Deezer download" },
            { status: 500 }
        );
    }
}

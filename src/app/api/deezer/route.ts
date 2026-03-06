import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import { execFile } from "child_process";

export const runtime = 'nodejs';
export const maxDuration = 60;

const md5 = (data: string) => crypto.createHash('md5').update(data).digest('hex');

// Detectar yt-dlp nativo (Railway Linux o Windows local)
const YT_DLP_PATH = os.platform() === "win32"
    ? require("path").join(process.cwd(), "yt-dlp.exe")
    : "/usr/local/bin/yt-dlp";
const HAS_YT_DLP = fs.existsSync(YT_DLP_PATH);

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

// ============== YOUTUBE FALLBACK (Piped + Invidious) ==============
const PIPED_INSTANCES = [
    "https://pipedapi.kavin.rocks",
    "https://pipedapi.adminforge.de",
    "https://pipedapi.in.projectsegfault.com",
    "https://pipedapi.leptons.xyz",
    "https://pipedapi.r4fo.com",
    "https://pipedapi.phoenixthrush.com",
    "https://pipedapi.drgns.space",
    "https://api.piped.projectsegfault.com"
];

const INVIDIOUS_INSTANCES = [
    "https://inv.tux.pizza",
    "https://invidious.nerdvpn.de",
    "https://invidious.jing.rocks",
    "https://iv.datura.network",
    "https://invidious.privacyredirect.com",
    "https://invidious.lunar.icu",
    "https://inv.nadeko.net",
    "https://invidious.protokolla.fi"
];

async function resolveYouTubeAudio(query: string): Promise<{
    audioUrl: string;
    title: string;
    artist: string;
    coverUrl: string;
} | null> {
    // 1. Try Piped
    for (const instance of PIPED_INSTANCES) {
        try {
            console.log(`[YT Fallback] Piped: ${instance}`);
            const searchRes = await fetch(
                `${instance}/search?q=${encodeURIComponent(query)}&filter=music_songs`,
                { signal: AbortSignal.timeout(8000) }
            );
            if (!searchRes.ok) continue;
            const data = await searchRes.json();
            let items = data.items || [];

            if (items.length === 0) {
                const searchRes2 = await fetch(
                    `${instance}/search?q=${encodeURIComponent(query)}&filter=videos`,
                    { signal: AbortSignal.timeout(8000) }
                );
                if (searchRes2.ok) {
                    const data2 = await searchRes2.json();
                    items = data2.items || [];
                }
            }
            if (items.length === 0) continue;

            const video = items[0];
            const videoId = video.url?.replace("/watch?v=", "") || "";
            if (!videoId) continue;

            const streamsRes = await fetch(
                `${instance}/streams/${videoId}`,
                { signal: AbortSignal.timeout(8000) }
            );
            if (!streamsRes.ok) continue;

            const streamsData = await streamsRes.json();
            const audioStreams = streamsData.audioStreams || [];
            if (audioStreams.length === 0) continue;

            const best = [...audioStreams]
                .filter((s: any) => s.url && s.mimeType)
                .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0))[0];
            if (!best) continue;

            console.log(`[YT Fallback] Piped resolved: ${best.mimeType} @ ${best.bitrate}bps`);
            return {
                audioUrl: best.url,
                title: streamsData.title || video.title || query,
                artist: streamsData.uploader || video.uploaderName || "Desconocido",
                coverUrl: streamsData.thumbnailUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            };
        } catch (err: any) {
            console.warn(`[YT Fallback] Piped ${instance} error:`, err.message);
            continue;
        }
    }

    // 2. Try Invidious
    for (const instance of INVIDIOUS_INSTANCES) {
        try {
            console.log(`[YT Fallback] Invidious: ${instance}`);
            const searchRes = await fetch(
                `${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=video&sort_by=relevance`,
                { signal: AbortSignal.timeout(10000) }
            );
            if (!searchRes.ok) continue;

            const text = await searchRes.text();
            let items;
            try { items = JSON.parse(text); } catch { continue; }
            if (!Array.isArray(items) || items.length === 0) continue;

            const video = items[0];
            const videoId = video.videoId;
            if (!videoId) continue;

            const videoRes = await fetch(
                `${instance}/api/v1/videos/${videoId}`,
                { signal: AbortSignal.timeout(10000) }
            );
            if (!videoRes.ok) continue;

            const videoText = await videoRes.text();
            let videoData;
            try { videoData = JSON.parse(videoText); } catch { continue; }
            const audioStreams = (videoData.adaptiveFormats || []).filter((f: any) =>
                f.type?.startsWith("audio/") && f.url
            );
            if (audioStreams.length === 0) continue;

            const best = [...audioStreams]
                .sort((a: any, b: any) => (parseInt(b.bitrate) || 0) - (parseInt(a.bitrate) || 0))[0];
            if (!best || !best.url) continue;

            console.log(`[YT Fallback] Invidious resolved: ${best.type} @ ${best.bitrate}bps`);
            return {
                audioUrl: best.url,
                title: videoData.title || query,
                artist: videoData.author || "Desconocido",
                coverUrl: videoData.videoThumbnails?.[0]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            };
        } catch (err: any) {
            console.warn(`[YT Fallback] Invidious ${instance} error:`, err.message);
            continue;
        }
    }

    return null;
}

// ============== DEEZER CORE ==============

async function initializeDeezer(forceReinit = false) {
    const dfi = await import("d-fi-core");
    const now = Date.now();
    if (!isDeezerInitialized || forceReinit || (now - lastInitTime > REINIT_INTERVAL_MS)) {
        console.log("[Deezer] Initializing d-fi-core with ARL... (force:", forceReinit, ")");
        await dfi.initDeezerApi(DEEZER_ARL);
        isDeezerInitialized = true;
        lastInitTime = now;
        console.log("[Deezer] Initialization successful");
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
        throw new Error("Track not found");
    }

    // 9 = 320kbps, 3 = 128kbps
    let trackUrlRes = await dfi.getTrackDownloadUrl(track, 9);
    if (!trackUrlRes || !trackUrlRes.trackUrl) {
        trackUrlRes = await dfi.getTrackDownloadUrl(track, 3);
        if (!trackUrlRes || !trackUrlRes.trackUrl) {
            throw new Error("Could not get stream URL");
        }
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
        return await streamFromDeezer(request, trackId, finalTitle, finalArtist);
    } catch (deezerErr: any) {
        console.error("[Deezer] Failed:", deezerErr.message);
        isDeezerInitialized = false;

        // Si falló Deezer y no tenemos title/artist, lo buscamos en API pública
        if (trackId && (!finalTitle || !finalArtist)) {
            try {
                const dzRes = await fetch(`https://api.deezer.com/track/${trackId}`);
                if (dzRes.ok) {
                    const dzData = await dzRes.json();
                    if (dzData.title && dzData.artist?.name) {
                        finalTitle = dzData.title;
                        finalArtist = dzData.artist.name;
                        console.log(`[Deezer] Public API got fallback info: ${finalArtist} - ${finalTitle}`);
                    }
                }
            } catch (e) {
                console.error("[Deezer] Public API fetch failed:", e);
            }
        }
    }

    // ===== 2. Fallback: YouTube =====
    if (finalTitle && finalArtist) {
        const query = `${finalArtist} - ${finalTitle}`;
        console.log(`[Deezer→YT] Falling back to YouTube for: ${query}`);

        // 2a. yt-dlp nativo (Railway) — rapidísimo ~2-3s
        if (HAS_YT_DLP) {
            try {
                console.log(`[yt-dlp] Resolving audio URL natively...`);
                const ytDlpResult = await new Promise<{ audioUrl: string; title: string; artist: string; videoId: string }>((resolve, reject) => {
                    execFile(YT_DLP_PATH, [
                        "--encoding", "utf8", "--no-playlist", "-f", "ba",
                        "--no-warnings", "--no-download",
                        "--print", "url", "--print", "%(title)s", "--print", "%(uploader)s", "--print", "%(id)s",
                        `ytsearch1:${query}`
                    ], { timeout: 15000 }, (err, stdout) => {
                        if (err) { reject(err); return; }
                        const lines = stdout.trim().split("\n").map(l => l.trim());
                        if (lines.length < 4 || !lines[0].startsWith("http")) { reject(new Error("no valid output")); return; }
                        resolve({ audioUrl: lines[0], title: lines[1], artist: lines[2], videoId: lines[3] });
                    });
                });

                console.log(`[yt-dlp] Resolved: "${ytDlpResult.title}" in ~2s`);
                const isPlay = searchParams.get("play") === "true";
                if (isPlay) return NextResponse.redirect(ytDlpResult.audioUrl);
                return NextResponse.json({
                    audioUrl: ytDlpResult.audioUrl,
                    title: ytDlpResult.title || query,
                    artist: ytDlpResult.artist || finalArtist,
                    coverUrl: `https://i.ytimg.com/vi/${ytDlpResult.videoId}/hqdefault.jpg`,
                });
            } catch (ytDlpErr: any) {
                console.warn(`[yt-dlp] Failed:`, ytDlpErr.message);
            }
        }

        // 2b. Piped/Invidious (Vercel o si yt-dlp falló)
        try {
            const result = await resolveYouTubeAudio(query);
            if (result) {
                console.log(`[Deezer→YT] YouTube resolved successfully: ${result.title}`);
                const isPlay = searchParams.get("play") === "true";
                if (isPlay) return NextResponse.redirect(result.audioUrl);
                return NextResponse.json({
                    audioUrl: result.audioUrl,
                    title: result.title,
                    artist: result.artist,
                    coverUrl: result.coverUrl,
                });
            }
        } catch (ytErr: any) {
            console.error("[Deezer→YT] YouTube fallback also failed:", ytErr.message);
        }
    }

    // ===== 3. Todo falló =====
    return NextResponse.json(
        { error: "All audio sources failed (Deezer + YouTube)" },
        { status: 500 }
    );
}

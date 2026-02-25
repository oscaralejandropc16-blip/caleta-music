import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";

// Forzar el runtime de Node.js
export const runtime = 'nodejs';
export const maxDuration = 60;

// Ruta al binario yt-dlp (raíz del proyecto)
const YT_DLP_PATH = path.join(process.cwd(), "yt-dlp.exe");

// ============== PIPED API (Public YouTube Proxy) ==============
// Las URLs de audio de Piped son proxied por sus servidores,
// así que NO son bloqueadas por YouTube incluso desde Vercel.
const PIPED_INSTANCES = [
    "https://pipedapi.kavin.rocks",
    "https://pipedapi.adminforge.de",
    "https://pipedapi.in.projectsegfault.com",
];

interface PipedSearchResult {
    url: string;
    title: string;
    uploaderName: string;
    thumbnail: string;
    duration: number;
}

interface PipedStream {
    title: string;
    uploader: string;
    thumbnailUrl: string;
    audioStreams: Array<{
        url: string;
        mimeType: string;
        bitrate: number;
        contentLength: number;
    }>;
}

/**
 * Busca y descarga audio usando la API de Piped (proxy público de YouTube).
 * Esto funciona desde Vercel porque Piped proxea las URLs de audio.
 */
async function searchAndDownloadWithPiped(query: string): Promise<{
    buffer: Buffer;
    contentType: string;
    title: string;
    artist: string;
    coverUrl: string;
}> {
    let lastError = "";

    for (const instance of PIPED_INSTANCES) {
        try {
            console.log(`[Piped] Trying instance: ${instance}`);

            // 1. Buscar
            const searchUrl = `${instance}/search?q=${encodeURIComponent(query)}&filter=music_songs`;
            const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(10000) });

            if (!searchRes.ok) {
                console.log(`[Piped] Search failed on ${instance}: ${searchRes.status}`);
                continue;
            }

            const searchData = await searchRes.json();
            const items = searchData.items || searchData.results || [];

            if (!items || items.length === 0) {
                // Retry with video filter
                const searchUrl2 = `${instance}/search?q=${encodeURIComponent(query)}&filter=videos`;
                const searchRes2 = await fetch(searchUrl2, { signal: AbortSignal.timeout(10000) });
                if (searchRes2.ok) {
                    const data2 = await searchRes2.json();
                    if (data2.items?.length > 0) {
                        items.push(...data2.items);
                    }
                }
            }

            if (!items || items.length === 0) {
                console.log(`[Piped] No results on ${instance}`);
                continue;
            }

            const video = items[0] as PipedSearchResult;
            // url format: "/watch?v=VIDEO_ID"
            const videoId = video.url?.replace("/watch?v=", "") || "";
            if (!videoId) {
                console.log("[Piped] No video ID in result");
                continue;
            }

            console.log(`[Piped] Found: "${video.title}" by ${video.uploaderName} (ID: ${videoId})`);

            // 2. Obtener streams
            const streamsUrl = `${instance}/streams/${videoId}`;
            const streamsRes = await fetch(streamsUrl, { signal: AbortSignal.timeout(15000) });

            if (!streamsRes.ok) {
                console.log(`[Piped] Streams failed on ${instance}: ${streamsRes.status}`);
                continue;
            }

            const streamsData: PipedStream = await streamsRes.json();

            if (!streamsData.audioStreams || streamsData.audioStreams.length === 0) {
                console.log("[Piped] No audio streams available");
                continue;
            }

            // Elegir el mejor stream de audio (mayor bitrate)
            const sortedStreams = [...streamsData.audioStreams]
                .filter(s => s.url && s.mimeType)
                .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

            if (sortedStreams.length === 0) {
                console.log("[Piped] No valid audio streams");
                continue;
            }

            const bestStream = sortedStreams[0];
            console.log(`[Piped] Best audio: ${bestStream.mimeType} @ ${bestStream.bitrate}bps, ${bestStream.contentLength} bytes`);

            // 3. Descargar el audio
            const audioRes = await fetch(bestStream.url, { signal: AbortSignal.timeout(45000) });
            if (!audioRes.ok || !audioRes.body) {
                console.log(`[Piped] Audio fetch failed: ${audioRes.status}`);
                continue;
            }

            // Leer todo el audio a un buffer
            const reader = audioRes.body.getReader();
            const chunks: Uint8Array[] = [];
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                if (value) chunks.push(value);
            }

            const buffer = Buffer.concat(chunks);
            console.log(`[Piped] Downloaded audio: ${buffer.length} bytes`);

            if (buffer.length < 10000) {
                console.log("[Piped] Audio too small, likely failed");
                continue;
            }

            return {
                buffer,
                contentType: bestStream.mimeType?.split(";")[0] || "audio/mp4",
                title: streamsData.title || video.title || "Enlace Descargado",
                artist: streamsData.uploader || video.uploaderName || "Desconocido",
                coverUrl: streamsData.thumbnailUrl || video.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            };
        } catch (err: any) {
            lastError = err.message;
            console.error(`[Piped] Instance ${instance} error:`, err.message);
            continue;
        }
    }

    throw new Error(`All Piped instances failed. Last error: ${lastError}`);
}

/**
 * Descarga audio de un video específico de YouTube usando Piped.
 */
async function downloadWithPiped(videoId: string): Promise<{
    buffer: Buffer;
    contentType: string;
    title: string;
    artist: string;
    coverUrl: string;
}> {
    let lastError = "";

    for (const instance of PIPED_INSTANCES) {
        try {
            const streamsUrl = `${instance}/streams/${videoId}`;
            console.log(`[Piped] Getting streams from ${instance} for ${videoId}`);
            const streamsRes = await fetch(streamsUrl, { signal: AbortSignal.timeout(15000) });

            if (!streamsRes.ok) continue;

            const data: PipedStream = await streamsRes.json();

            if (!data.audioStreams?.length) continue;

            const bestStream = [...data.audioStreams]
                .filter(s => s.url && s.mimeType)
                .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];

            if (!bestStream) continue;

            const audioRes = await fetch(bestStream.url, { signal: AbortSignal.timeout(45000) });
            if (!audioRes.ok || !audioRes.body) continue;

            const reader = audioRes.body.getReader();
            const chunks: Uint8Array[] = [];
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                if (value) chunks.push(value);
            }

            const buffer = Buffer.concat(chunks);
            if (buffer.length < 10000) continue;

            return {
                buffer,
                contentType: bestStream.mimeType?.split(";")[0] || "audio/mp4",
                title: data.title || "Enlace Descargado",
                artist: data.uploader || "Desconocido",
                coverUrl: data.thumbnailUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            };
        } catch (err: any) {
            lastError = err.message;
            continue;
        }
    }

    throw new Error(`Piped download failed for ${videoId}: ${lastError}`);
}

// ============== YT-DLP FUNCTIONS (LOCAL/WINDOWS ONLY) ==============

async function getVideoMetadata(videoUrl: string): Promise<{ title: string; uploader: string }> {
    if (process.env.VERCEL || !fs.existsSync(YT_DLP_PATH)) {
        return { title: "Enlace Descargado", uploader: "Desconocido" };
    }

    return new Promise((resolve) => {
        execFile(YT_DLP_PATH, [
            "--encoding", "utf8", "--no-playlist", "--no-warnings",
            "--print", "%(title)s\n%(uploader)s", "--skip-download", videoUrl
        ], { timeout: 15000 }, (error, stdout) => {
            if (error || !stdout.trim()) {
                resolve({ title: "Enlace Descargado", uploader: "Desconocido" });
                return;
            }
            const lines = stdout.trim().split("\n");
            resolve({
                title: lines[0]?.trim() || "Enlace Descargado",
                uploader: lines[1]?.trim() || "Desconocido"
            });
        });
    });
}

async function searchAndGetStreamUrl(query: string): Promise<{ streamUrl: string; title: string; uploader: string; videoId: string }> {
    return new Promise((resolve, reject) => {
        execFile(YT_DLP_PATH, [
            "--encoding", "utf8", "--no-playlist", "-f", "ba", "--no-warnings",
            "--print", "url", "--print", "%(title)s", "--print", "%(uploader)s", "--print", "%(id)s",
            `ytsearch1:${query}`
        ], { timeout: 20000 }, (error, stdout) => {
            if (error) { reject(new Error(`yt-dlp search failed: ${error.message}`)); return; }
            const lines = stdout.trim().split("\n").map(l => l.trim());
            if (lines.length < 4 || !lines[0]) { reject(new Error("yt-dlp no output")); return; }
            resolve({ streamUrl: lines[0], title: lines[1] || "Enlace Descargado", uploader: lines[2] || "Desconocido", videoId: lines[3] || "" });
        });
    });
}

async function downloadWithYtDlp(videoUrl: string): Promise<{ filePath: string; contentType: string }> {
    const uniqueId = `mv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const tmpFile = path.join(os.tmpdir(), `${uniqueId}.%(ext)s`);

    return new Promise((resolve, reject) => {
        execFile(YT_DLP_PATH, [
            "--encoding", "utf8", "--no-playlist", "-f", "ba", "-o", tmpFile,
            "--no-warnings", "--force-overwrites", "--print", "after_move:filepath", videoUrl
        ], { timeout: 90000 }, (error, stdout) => {
            if (error) console.error("[yt-dlp] Error:", error.message);

            const outputPath = stdout?.trim();
            if (outputPath && fs.existsSync(outputPath)) {
                const ext = path.extname(outputPath).toLowerCase();
                resolve({ filePath: outputPath, contentType: ext === ".m4a" ? "audio/mp4" : ext === ".webm" ? "audio/webm" : "audio/mpeg" });
                return;
            }

            const files = fs.readdirSync(os.tmpdir()).filter(f => f.startsWith(uniqueId));
            if (files.length > 0) {
                const fp = path.join(os.tmpdir(), files[0]);
                const ext = path.extname(fp).toLowerCase();
                resolve({ filePath: fp, contentType: ext === ".m4a" ? "audio/mp4" : ext === ".webm" ? "audio/webm" : "audio/mpeg" });
                return;
            }

            reject(error ? new Error(`yt-dlp failed: ${error.message}`) : new Error("yt-dlp no output"));
        });
    });
}

// ============== UTILITIES ==============

function isYouTubeUrl(url: string): boolean {
    try {
        const h = new URL(url).hostname;
        return h.includes("youtube.com") || h.includes("youtu.be") || h.includes("music.youtube.com");
    } catch { return false; }
}

function extractYouTubeVideoId(url: string): string | null {
    try {
        const parsed = new URL(url);
        if (parsed.hostname.includes("youtu.be")) return parsed.pathname.slice(1);
        return parsed.searchParams.get("v");
    } catch { return null; }
}

function cleanYouTubeUrl(url: string): string {
    const videoId = extractYouTubeVideoId(url);
    return videoId ? `https://www.youtube.com/watch?v=${videoId}` : url;
}

// ============== MAIN HANDLER ==============

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const title = searchParams.get("title");
    const artist = searchParams.get("artist");
    const directUrl = searchParams.get("url");

    if (!title && !artist && !directUrl) {
        return NextResponse.json({ error: "No title/artist or direct URL provided" }, { status: 400 });
    }

    try {
        let videoUrlToDownload = directUrl;

        // 1. Si tenemos title+artist pero no URL directa, buscar en YouTube
        if (!videoUrlToDownload && title && artist) {
            const query = `${artist} - ${title}`;
            console.log("[Download] Buscando:", query);

            // LOCAL: usar yt-dlp.exe
            if (fs.existsSync(YT_DLP_PATH)) {
                try {
                    const searchResult = await searchAndGetStreamUrl(query);
                    const ytUrl = `https://www.youtube.com/watch?v=${searchResult.videoId}`;
                    const coverUrl = `https://i.ytimg.com/vi/${searchResult.videoId}/hqdefault.jpg`;

                    const { filePath, contentType } = await downloadWithYtDlp(ytUrl);
                    const fileBuffer = fs.readFileSync(filePath);
                    try { fs.unlinkSync(filePath); } catch { /* ignore */ }

                    return new NextResponse(fileBuffer, {
                        status: 200,
                        headers: {
                            "Content-Type": contentType,
                            "Content-Length": fileBuffer.length.toString(),
                            "X-Video-Title": encodeURIComponent(searchResult.title),
                            "X-Video-Artist": encodeURIComponent(searchResult.uploader),
                            "X-Video-Cover": coverUrl,
                            "Access-Control-Expose-Headers": "X-Video-Title, X-Video-Artist, X-Video-Cover",
                        },
                    });
                } catch (err: any) {
                    console.error("[yt-dlp] Failed:", err.message);
                    return NextResponse.json({ error: "Download failed" }, { status: 500 });
                }
            }

            // VERCEL: usar Piped API (proxy de YouTube - no bloqueado!)
            console.log("[Download] Using Piped API for Vercel...");
            try {
                const result = await searchAndDownloadWithPiped(query);

                return new NextResponse(new Uint8Array(result.buffer), {
                    status: 200,
                    headers: {
                        "Content-Type": result.contentType,
                        "Content-Length": result.buffer.length.toString(),
                        "X-Video-Title": encodeURIComponent(result.title),
                        "X-Video-Artist": encodeURIComponent(result.artist),
                        "X-Video-Cover": result.coverUrl,
                        "Access-Control-Expose-Headers": "X-Video-Title, X-Video-Artist, X-Video-Cover, Content-Length",
                    },
                });
            } catch (pipedErr: any) {
                console.error("[Piped] Failed:", pipedErr.message);
                return NextResponse.json({ error: "YouTube download failed: " + pipedErr.message }, { status: 500 });
            }
        }

        if (!videoUrlToDownload) {
            return NextResponse.json({ error: "Failed to determine video URL" }, { status: 500 });
        }

        // 2. Si es una URL de YouTube directa, descargar
        if (isYouTubeUrl(videoUrlToDownload)) {
            videoUrlToDownload = cleanYouTubeUrl(videoUrlToDownload);
            const videoId = extractYouTubeVideoId(videoUrlToDownload);
            const coverUrl = videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : "";

            // VERCEL: usar Piped
            if (process.env.VERCEL || !fs.existsSync(YT_DLP_PATH)) {
                if (videoId) {
                    try {
                        const result = await downloadWithPiped(videoId);
                        return new NextResponse(new Uint8Array(result.buffer), {
                            status: 200,
                            headers: {
                                "Content-Type": result.contentType,
                                "Content-Length": result.buffer.length.toString(),
                                "X-Video-Title": encodeURIComponent(result.title),
                                "X-Video-Artist": encodeURIComponent(result.artist),
                                "X-Video-Cover": coverUrl,
                                "Access-Control-Expose-Headers": "X-Video-Title, X-Video-Artist, X-Video-Cover, Content-Length",
                            },
                        });
                    } catch (err: any) {
                        console.error("[Piped direct] Error:", err.message);
                        return NextResponse.json({ error: "YouTube download failed" }, { status: 500 });
                    }
                }
                return NextResponse.json({ error: "Invalid YouTube URL" }, { status: 400 });
            }

            // LOCAL: usar yt-dlp
            const [{ filePath, contentType }, metadata] = await Promise.all([
                downloadWithYtDlp(videoUrlToDownload),
                getVideoMetadata(videoUrlToDownload)
            ]);

            const fileBuffer = fs.readFileSync(filePath);
            try { fs.unlinkSync(filePath); } catch { /* ignore */ }

            return new NextResponse(fileBuffer, {
                status: 200,
                headers: {
                    "Content-Type": contentType,
                    "Content-Length": fileBuffer.length.toString(),
                    "X-Video-Title": encodeURIComponent(metadata.title),
                    "X-Video-Artist": encodeURIComponent(metadata.uploader),
                    "X-Video-Cover": coverUrl,
                    "Access-Control-Expose-Headers": "X-Video-Title, X-Video-Artist, X-Video-Cover",
                },
            });
        }

        // 3. Fallback: enlace directo (no-YouTube)
        console.log("[Download] Fetching direct URL:", videoUrlToDownload);
        const response = await fetch(videoUrlToDownload);
        if (!response.ok) {
            return NextResponse.json({ error: "Failed to fetch remote audio" }, { status: response.status });
        }

        return new NextResponse(response.body, {
            status: 200,
            headers: { "Content-Type": response.headers.get("Content-Type") || "audio/mpeg" },
        });

    } catch (error: any) {
        console.error("[Download] Error:", error);
        return NextResponse.json({ error: error.message || "Failed to download" }, { status: 500 });
    }
}

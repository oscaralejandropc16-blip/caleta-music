import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";

export const runtime = 'nodejs';
export const maxDuration = 60;

// Detectar yt-dlp: Windows local (.exe) o Linux/Railway (/usr/local/bin/yt-dlp)
const YT_DLP_PATH = os.platform() === "win32"
    ? path.join(process.cwd(), "yt-dlp.exe")
    : "/usr/local/bin/yt-dlp";

// ============== PIPED API (Public YouTube Proxy) ==============
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

// ============== INVIDIOUS API (Fallback YouTube Proxy) ==============
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

// ============== COBALT API (High Reliability YouTube Proxy) ==============
async function resolveWithCobalt(url: string): Promise<{ audioUrl: string; contentType: string; title: string; artist: string; coverUrl: string }> {
    console.log(`[Cobalt] Trying to resolve: ${url}`);
    try {
        const res = await fetch("https://api.cobalt.tools/api/json", {
            method: "POST",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                url: url,
                isAudioOnly: true,
                aFormat: "mp3",
                filenamePattern: "pretty"
            }),
            signal: AbortSignal.timeout(15000)
        });

        if (!res.ok) throw new Error(`Status ${res.status}`);
        const data = await res.json();

        if (data.status === "error") throw new Error(data.text || "Cobalt error");

        if (data.status === "redirect" || data.status === "stream") {
            const videoId = extractYouTubeVideoId(url) || "";
            return {
                audioUrl: data.url,
                contentType: "audio/mpeg",
                title: data.filename || "YouTube Audio",
                artist: "YouTube",
                coverUrl: videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : ""
            };
        }
        throw new Error(`Unexpected status: ${data.status}`);
    } catch (err: any) {
        console.warn(`[Cobalt] Error: ${err.message}`);
        throw err;
    }
}

/**
 * Usa Invidious API como fallback para buscar y resolver audio de YouTube.
 */
async function resolveAudioUrlWithInvidious(query: string): Promise<{
    audioUrl: string;
    contentType: string;
    title: string;
    artist: string;
    coverUrl: string;
}> {
    let lastError = "";

    for (const instance of INVIDIOUS_INSTANCES) {
        try {
            console.log(`[Invidious] Trying: ${instance} for "${query}"`);

            // 1. Buscar
            const searchRes = await fetch(
                `${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=video&sort_by=relevance`,
                { signal: AbortSignal.timeout(10000) }
            );

            if (!searchRes.ok) continue;

            const items = await searchRes.json();
            if (!Array.isArray(items) || items.length === 0) continue;

            const video = items[0];
            const videoId = video.videoId;
            if (!videoId) continue;

            console.log(`[Invidious] Found: "${video.title}" (${videoId})`);

            // 2. Obtener detalles del video con streams
            const videoRes = await fetch(
                `${instance}/api/v1/videos/${videoId}`,
                { signal: AbortSignal.timeout(10000) }
            );

            if (!videoRes.ok) continue;

            const videoData = await videoRes.json();
            const adaptiveFormats = videoData.adaptiveFormats || [];

            // Filtrar solo streams de audio
            const audioStreams = adaptiveFormats.filter((f: any) =>
                f.type?.startsWith("audio/") && f.url
            );

            if (audioStreams.length === 0) continue;

            // Elegir el mejor (mayor bitrate)
            const best = [...audioStreams]
                .sort((a: any, b: any) => (parseInt(b.bitrate) || 0) - (parseInt(a.bitrate) || 0))[0];

            if (!best || !best.url) continue;

            console.log(`[Invidious] Audio URL resolved: ${best.type} @ ${best.bitrate}bps`);

            return {
                audioUrl: best.url,
                contentType: best.type?.split(";")[0] || "audio/mp4",
                title: videoData.title || "Enlace Descargado",
                artist: videoData.author || "Desconocido",
                coverUrl: videoData.videoThumbnails?.[0]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            };
        } catch (err: any) {
            lastError = err.message;
            console.error(`[Invidious] ${instance} error:`, err.message);
            continue;
        }
    }

    throw new Error(`All Invidious instances failed: ${lastError}`);
}

/**
 * Usa Piped API para buscar un video y resolver la URL directa de audio.
 */
async function resolveAudioUrlWithPiped(query: string): Promise<{
    audioUrl: string;
    contentType: string;
    title: string;
    artist: string;
    coverUrl: string;
}> {
    let lastError = "";

    for (const instance of PIPED_INSTANCES) {
        try {
            console.log(`[Piped] Trying: ${instance} for "${query}"`);

            // 1. Buscar
            const searchRes = await fetch(
                `${instance}/search?q=${encodeURIComponent(query)}&filter=music_songs`,
                { signal: AbortSignal.timeout(8000) }
            );

            let items: any[] = [];
            if (searchRes.ok) {
                const data = await searchRes.json();
                items = data.items || [];
            }

            // Si no hay resultados con music_songs, intentar con videos
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

            if (items.length === 0) {
                console.log(`[Piped] No results on ${instance}`);
                continue;
            }

            const video = items[0];
            const videoId = video.url?.replace("/watch?v=", "") || "";
            if (!videoId) continue;

            console.log(`[Piped] Found: "${video.title}" (${videoId})`);

            // 2. Obtener streams (solo metadatos, no descarga)
            const streamsRes = await fetch(
                `${instance}/streams/${videoId}`,
                { signal: AbortSignal.timeout(8000) }
            );

            if (!streamsRes.ok) continue;

            const streamsData = await streamsRes.json();
            const audioStreams = streamsData.audioStreams || [];

            if (audioStreams.length === 0) continue;

            // Elegir el mejor stream (mayor bitrate)
            const best = [...audioStreams]
                .filter((s: any) => s.url && s.mimeType)
                .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0))[0];

            if (!best) continue;

            console.log(`[Piped] Audio URL resolved: ${best.mimeType} @ ${best.bitrate}bps`);

            return {
                audioUrl: best.url,
                contentType: best.mimeType?.split(";")[0] || "audio/mp4",
                title: streamsData.title || video.title || "Enlace Descargado",
                artist: streamsData.uploader || video.uploaderName || "Desconocido",
                coverUrl: streamsData.thumbnailUrl || video.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            };
        } catch (err: any) {
            lastError = err.message;
            console.error(`[Piped] ${instance} error:`, err.message);
            continue;
        }
    }

    // ===== FALLBACK: Invidious =====
    console.log("[Piped] All instances failed, trying Invidious fallback...");
    try {
        return await resolveAudioUrlWithInvidious(query);
    } catch (invErr: any) {
        throw new Error(`All Piped and Invidious instances failed. Piped: ${lastError}. Invidious: ${invErr.message}`);
    }
}

/**
 * Resuelve la URL de audio de un video específico usando Piped + Invidious fallback.
 */
async function resolveVideoAudioUrl(videoId: string): Promise<{
    audioUrl: string;
    contentType: string;
    title: string;
    artist: string;
    coverUrl: string;
}> {
    // Intentar Cobalt PRIMERO (más fiable para links directos)
    try {
        const urlForCobalt = `https://www.youtube.com/watch?v=${videoId}`;
        return await resolveWithCobalt(urlForCobalt);
    } catch (err) {
        console.warn("[Download] Cobalt fallback activated due to:", err);
    }

    // Intentar Piped
    for (const instance of PIPED_INSTANCES) {
        try {
            const res = await fetch(`${instance}/streams/${videoId}`, { signal: AbortSignal.timeout(8000) });
            if (!res.ok) continue;

            const data = await res.json();
            const audioStreams = data.audioStreams || [];
            if (audioStreams.length === 0) continue;

            const best = [...audioStreams]
                .filter((s: any) => s.url && s.mimeType)
                .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0))[0];
            if (!best) continue;

            return {
                audioUrl: best.url,
                contentType: best.mimeType?.split(";")[0] || "audio/mp4",
                title: data.title || "Enlace Descargado",
                artist: data.uploader || "Desconocido",
                coverUrl: data.thumbnailUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            };
        } catch { continue; }
    }

    // Fallback: Invidious
    for (const instance of INVIDIOUS_INSTANCES) {
        try {
            const res = await fetch(`${instance}/api/v1/videos/${videoId}`, { signal: AbortSignal.timeout(10000) });
            if (!res.ok) continue;

            const data = await res.json();
            const audioStreams = (data.adaptiveFormats || []).filter((f: any) =>
                f.type?.startsWith("audio/") && f.url
            );
            if (audioStreams.length === 0) continue;

            const best = [...audioStreams]
                .sort((a: any, b: any) => (parseInt(b.bitrate) || 0) - (parseInt(a.bitrate) || 0))[0];
            if (!best || !best.url) continue;

            return {
                audioUrl: best.url,
                contentType: best.type?.split(";")[0] || "audio/mp4",
                title: data.title || "Enlace Descargado",
                artist: data.author || "Desconocido",
                coverUrl: data.videoThumbnails?.[0]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            };
        } catch { continue; }
    }

    throw new Error("Failed to resolve audio URL from all available proxies");
}

// ============== YT-DLP (LOCAL/WINDOWS) ==============

async function getVideoMetadata(videoUrl: string): Promise<{ title: string; uploader: string }> {
    if (!fs.existsSync(YT_DLP_PATH)) return { title: "Enlace Descargado", uploader: "Desconocido" };
    return new Promise((resolve) => {
        execFile(YT_DLP_PATH, [
            "--encoding", "utf8", "--no-playlist", "--no-warnings",
            "--print", "%(title)s\n%(uploader)s", "--skip-download", videoUrl
        ], { timeout: 15000 }, (error, stdout) => {
            if (error || !stdout.trim()) { resolve({ title: "Enlace Descargado", uploader: "Desconocido" }); return; }
            const lines = stdout.trim().split("\n");
            resolve({ title: lines[0]?.trim() || "Enlace Descargado", uploader: lines[1]?.trim() || "Desconocido" });
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
            reject(error ? new Error(`yt-dlp: ${error.message}`) : new Error("yt-dlp no output"));
        });
    });
}

// ============== UTILITIES ==============

function isYouTubeUrl(url: string): boolean {
    try {
        const h = new URL(url).hostname;
        return h.includes("youtube.com") || h.includes("youtu.be") || h.includes("music.youtube.com");
    } catch {
        return false;
    }
}

function extractYouTubeVideoId(url: string): string | null {
    try {
        const parsed = new URL(url);
        // youtu.be/VIDEO_ID
        if (parsed.hostname.includes("youtu.be")) return parsed.pathname.slice(1).split(/[?#]/)[0];
        // youtube.com/watch?v=VIDEO_ID
        const v = parsed.searchParams.get("v");
        if (v) return v;
        // Shorts: youtube.com/shorts/VIDEO_ID
        if (parsed.pathname.includes("/shorts/")) return parsed.pathname.split("/shorts/")[1].split(/[?#]/)[0];
        // Live: youtube.com/live/VIDEO_ID
        if (parsed.pathname.includes("/live/")) return parsed.pathname.split("/live/")[1].split(/[?#]/)[0];
        // v/VIDEO_ID
        if (parsed.pathname.includes("/v/")) return parsed.pathname.split("/v/")[1].split(/[?#]/)[0];
        // embed/VIDEO_ID
        if (parsed.pathname.includes("/embed/")) return parsed.pathname.split("/embed/")[1].split(/[?#]/)[0];

        return null;
    } catch {
        return null;
    }
}

// ============== PROXY AUDIO STREAM ==============

async function proxyAudioStream(result: { audioUrl: string; contentType: string; title: string; artist: string; coverUrl: string }) {
    console.log(`[Download] Proxying audio stream from: ${result.audioUrl}`);
    try {
        const streamRes = await fetch(result.audioUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
        });

        if (!streamRes.ok) {
            console.error(`[Download] Failed to proxy stream. Status: ${streamRes.status}`);
            return NextResponse.json({ error: `Stream fetch failed with status ${streamRes.status}` }, { status: 500 });
        }

        return new NextResponse(streamRes.body, {
            status: 200,
            headers: {
                "Content-Type": result.contentType || streamRes.headers.get("Content-Type") || "audio/mpeg",
                "Content-Length": streamRes.headers.get("Content-Length") || "",
                "X-Video-Title": encodeURIComponent(result.title),
                "X-Video-Artist": encodeURIComponent(result.artist),
                "X-Video-Cover": result.coverUrl,
                "Access-Control-Expose-Headers": "X-Video-Title, X-Video-Artist, X-Video-Cover",
            }
        });
    } catch (err: any) {
        console.error(`[Download] Proxy stream error: ${err.message}`);
        return NextResponse.json({ error: err.message || "Failed to proxy stream" }, { status: 500 });
    }
}

// ============== MAIN HANDLER ==============

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const title = searchParams.get("title");
    const artist = searchParams.get("artist");
    const directUrl = searchParams.get("url");

    if (!title && !artist && !directUrl) {
        return NextResponse.json({ error: "No params provided" }, { status: 400 });
    }

    try {
        // CASE: Direct YouTube Link
        if (directUrl && isYouTubeUrl(directUrl)) {
            const videoId = extractYouTubeVideoId(directUrl);
            console.log(`[Download] YouTube URL detected: ${directUrl}, videoId: ${videoId}`);

            if (videoId) {
                // Try Cobalt first as it's often the fastest and most reliable for links
                try {
                    const result = await resolveWithCobalt(directUrl);
                    console.log(`[Download] Cobalt success for videoId: ${videoId}`);
                    return await proxyAudioStream(result);
                } catch (cobaltErr: any) {
                    console.warn(`[Download] Cobalt failed, falling back: ${cobaltErr.message}`);
                }

                // Try native yt-dlp if available
                const hasYtDlp = fs.existsSync(YT_DLP_PATH);
                if (hasYtDlp) {
                    try {
                        const isPlay = searchParams.get("play") === "true";
                        if (isPlay) {
                            const streamUrlRes = await new Promise<string>((res, rej) => {
                                execFile(YT_DLP_PATH, [
                                    "--encoding", "utf8", "--no-playlist", "-f", "ba", "--no-warnings",
                                    "--print", "url", directUrl
                                ], { timeout: 15000 }, (err, stdout) => {
                                    if (err) { rej(err); return; }
                                    const url = stdout.trim().split("\n")[0];
                                    if (url && url.startsWith("http")) res(url);
                                    else rej(new Error("no stream url"));
                                });
                            });
                            return NextResponse.redirect(streamUrlRes);
                        }

                        const [{ filePath, contentType }, metadata] = await Promise.all([
                            downloadWithYtDlp(directUrl),
                            getVideoMetadata(directUrl)
                        ]);
                        const fileBuffer = fs.readFileSync(filePath);
                        try { fs.unlinkSync(filePath); } catch { }

                        return new NextResponse(fileBuffer, {
                            status: 200,
                            headers: {
                                "Content-Type": contentType,
                                "Content-Length": fileBuffer.length.toString(),
                                "X-Video-Title": encodeURIComponent(metadata.title),
                                "X-Video-Artist": encodeURIComponent(metadata.uploader),
                                "X-Video-Cover": `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                                "Access-Control-Expose-Headers": "X-Video-Title, X-Video-Artist, X-Video-Cover",
                            },
                        });
                    } catch (ytdlpErr: any) {
                        console.warn(`[Download] yt-dlp failed: ${ytdlpErr.message}`);
                    }
                }

                // Fallback to Piped/Invidious
                try {
                    const result = await resolveVideoAudioUrl(videoId);
                    return await proxyAudioStream(result);
                } catch (fallbackErr: any) {
                    console.error(`[Download] All YouTube methods failed: ${fallbackErr.message}`);
                }
            } else {
                console.warn(`[Download] Could not extract video ID from YouTube URL: ${directUrl}`);
            }
        }

        // CASE: Search & Download (Title + Artist)
        if (!directUrl && title && artist) {
            const query = `${artist} - ${title}`;
            console.log(`[Download] Resolving by query: ${query}`);

            // Try local yt-dlp first
            const hasYtDlp = fs.existsSync(YT_DLP_PATH);
            if (hasYtDlp) {
                try {
                    const searchResult = await new Promise<{ streamUrl: string; title: string; uploader: string; videoId: string }>((res, rej) => {
                        execFile(YT_DLP_PATH, [
                            "--encoding", "utf8", "--no-playlist", "-f", "ba", "--no-warnings",
                            "--print", "url", "--print", "%(title)s", "--print", "%(uploader)s", "--print", "%(id)s",
                            `ytsearch1:${query}`
                        ], { timeout: 20000 }, (err, stdout) => {
                            if (err) { rej(err); return; }
                            const lines = stdout.trim().split("\n").map(l => l.trim());
                            if (lines.length < 4) { rej(new Error("no output")); return; }
                            res({ streamUrl: lines[0], title: lines[1], uploader: lines[2], videoId: lines[3] });
                        });
                    });

                    const isPlay = searchParams.get("play") === "true";
                    if (isPlay) return NextResponse.redirect(searchResult.streamUrl);

                    const ytUrl = `https://www.youtube.com/watch?v=${searchResult.videoId}`;
                    const { filePath, contentType } = await downloadWithYtDlp(ytUrl);
                    const fileBuffer = fs.readFileSync(filePath);
                    try { fs.unlinkSync(filePath); } catch { }

                    return new NextResponse(fileBuffer, {
                        status: 200,
                        headers: {
                            "Content-Type": contentType,
                            "Content-Length": fileBuffer.length.toString(),
                            "X-Video-Title": encodeURIComponent(searchResult.title),
                            "X-Video-Artist": encodeURIComponent(searchResult.uploader),
                            "X-Video-Cover": `https://i.ytimg.com/vi/${searchResult.videoId}/hqdefault.jpg`,
                            "Access-Control-Expose-Headers": "X-Video-Title, X-Video-Artist, X-Video-Cover",
                        },
                    });
                } catch (err: any) {
                    console.warn(`[Download] Search query with yt-dlp failed: ${err.message}`);
                }
            }

            // Fallback: Piped
            try {
                const result = await resolveAudioUrlWithPiped(query);
                return await proxyAudioStream(result);
            } catch (err: any) {
                console.error(`[Download] Search query fallback failed: ${err.message}`);
            }
        }

        // Generic direct link download (non-YouTube)
        if (directUrl) {
            console.log(`[Download] Fetching non-YouTube direct URL: ${directUrl}`);
            try {
                const response = await fetch(directUrl);
                if (!response.ok) return NextResponse.json({ error: "Fetch failed" }, { status: response.status });
                return new NextResponse(response.body, {
                    status: 200,
                    headers: { "Content-Type": response.headers.get("Content-Type") || "audio/mpeg" },
                });
            } catch (err: any) {
                console.error(`[Download] Direct link fetch failed: ${err.message}`);
            }
        }

        return NextResponse.json({ error: "No valid parameters or all download methods failed" }, { status: 400 });

    } catch (error: any) {
        console.error("[Download] Critical Error:", error);
        return NextResponse.json({ error: error.message || "Failed to download" }, { status: 500 });
    }
}

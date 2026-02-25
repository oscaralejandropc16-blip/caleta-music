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

/**
 * Usa youtubei.js (Innertube) para buscar y obtener stream de YouTube.
 * Funciona bien en Vercel/serverless porque usa la API interna de YouTube.
 */
async function searchAndStreamWithInnertube(query: string): Promise<{
    stream: ReadableStream<Uint8Array>;
    contentType: string;
    contentLength: string;
    title: string;
    artist: string;
    coverUrl: string;
}> {
    const { Innertube } = await import('youtubei.js');
    const yt = await Innertube.create({
        generate_session_locally: true,
    });

    console.log("[Innertube] Searching for:", query);
    const searchResults = await yt.search(query, { type: 'video' });

    const firstVideo = searchResults.results?.find((r: any) => r.type === 'Video') as any;
    if (!firstVideo || !firstVideo.id) {
        throw new Error("No video found on YouTube");
    }

    console.log("[Innertube] Found:", firstVideo.title?.text, "by", firstVideo.author?.name);

    const info = await yt.getBasicInfo(firstVideo.id);
    const format = info.chooseFormat({ type: 'audio', quality: 'best' });

    const streamUrl = await format.decipher(yt.session.player);
    if (!streamUrl) {
        throw new Error("Could not decipher audio URL");
    }

    const response = await fetch(streamUrl);
    if (!response.ok || !response.body) {
        throw new Error(`Failed to fetch YouTube audio stream: ${response.status}`);
    }

    return {
        stream: response.body,
        contentType: format.mime_type || 'audio/webm',
        contentLength: format.content_length?.toString() || response.headers.get('content-length') || "",
        title: firstVideo.title?.text || info.basic_info?.title || "Enlace Descargado",
        artist: firstVideo.author?.name || info.basic_info?.author || "Desconocido",
        coverUrl: firstVideo.best_thumbnail?.url || `https://i.ytimg.com/vi/${firstVideo.id}/hqdefault.jpg`,
    };
}

/**
 * Obtiene stream de un video específico de YouTube usando Innertube
 */
async function streamWithInnertube(videoId: string): Promise<{
    stream: ReadableStream<Uint8Array>;
    contentType: string;
    contentLength: string;
    title: string;
    artist: string;
}> {
    const { Innertube } = await import('youtubei.js');
    const yt = await Innertube.create({
        generate_session_locally: true,
    });

    const info = await yt.getBasicInfo(videoId);
    const format = info.chooseFormat({ type: 'audio', quality: 'best' });

    const streamUrl = await format.decipher(yt.session.player);
    if (!streamUrl) {
        throw new Error("Could not decipher audio URL");
    }

    const response = await fetch(streamUrl);
    if (!response.ok || !response.body) {
        throw new Error(`Failed to fetch YouTube audio: ${response.status}`);
    }

    return {
        stream: response.body,
        contentType: format.mime_type || 'audio/webm',
        contentLength: format.content_length?.toString() || response.headers.get('content-length') || "",
        title: info.basic_info?.title || "Enlace Descargado",
        artist: info.basic_info?.author || "Desconocido",
    };
}

/**
 * Obtiene metadatos del video usando yt-dlp (solo local/Windows).
 */
async function getVideoMetadata(videoUrl: string): Promise<{ title: string; uploader: string }> {
    if (process.env.VERCEL || !fs.existsSync(YT_DLP_PATH)) {
        return { title: "Enlace Descargado", uploader: "Desconocido" };
    }

    return new Promise((resolve) => {
        const args = [
            "--encoding", "utf8",
            "--no-playlist",
            "--no-warnings",
            "--print", "%(title)s\n%(uploader)s",
            "--skip-download",
            videoUrl
        ];

        execFile(YT_DLP_PATH, args, { timeout: 15000 }, (error, stdout) => {
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

/**
 * Usa yt-dlp para buscar en YouTube y obtener la URL de streaming directa.
 */
async function searchAndGetStreamUrl(query: string): Promise<{ streamUrl: string; title: string; uploader: string; videoId: string }> {
    return new Promise((resolve, reject) => {
        const searchQuery = `ytsearch1:${query}`;
        execFile(YT_DLP_PATH, [
            "--encoding", "utf8",
            "--no-playlist",
            "-f", "ba",
            "--no-warnings",
            "--print", "url",
            "--print", "%(title)s",
            "--print", "%(uploader)s",
            "--print", "%(id)s",
            searchQuery
        ], {
            timeout: 20000,
        }, (error, stdout, stderr) => {
            if (error) {
                console.error("[yt-dlp search] Error:", error.message);
                reject(new Error(`yt-dlp search failed: ${error.message}`));
                return;
            }

            const lines = stdout.trim().split("\n").map(l => l.trim());
            if (lines.length < 4 || !lines[0]) {
                reject(new Error("yt-dlp search didn't return expected output"));
                return;
            }

            resolve({
                streamUrl: lines[0],
                title: lines[1] || "Enlace Descargado",
                uploader: lines[2] || "Desconocido",
                videoId: lines[3] || "",
            });
        });
    });
}

/**
 * Descarga el audio completo con yt-dlp a un archivo temporal.
 */
async function downloadWithYtDlp(videoUrl: string): Promise<{ filePath: string; contentType: string }> {
    const uniqueId = `mv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const tmpFile = path.join(os.tmpdir(), `${uniqueId}.%(ext)s`);

    return new Promise((resolve, reject) => {
        const args = [
            "--encoding", "utf8",
            "--no-playlist",
            "-f", "ba",
            "-o", tmpFile,
            "--no-warnings",
            "--force-overwrites",
            "--print", "after_move:filepath",
            videoUrl
        ];

        console.log("[yt-dlp] Downloading:", videoUrl);

        execFile(YT_DLP_PATH, args, {
            timeout: 90000,
        }, (error, stdout, stderr) => {
            if (error) {
                console.error("[yt-dlp] Error:", error.message);
            }

            const outputPath = stdout?.trim();
            if (outputPath && fs.existsSync(outputPath)) {
                console.log("[yt-dlp] Downloaded to:", outputPath);
                const ext = path.extname(outputPath).toLowerCase();
                const contentType = ext === ".m4a" ? "audio/mp4" : ext === ".webm" ? "audio/webm" : "audio/mpeg";
                resolve({ filePath: outputPath, contentType });
                return;
            }

            const tmpDir = os.tmpdir();
            const files = fs.readdirSync(tmpDir).filter(f => f.startsWith(uniqueId));
            if (files.length > 0) {
                const fallbackPath = path.join(tmpDir, files[0]);
                const ext = path.extname(fallbackPath).toLowerCase();
                const ct = ext === ".m4a" ? "audio/mp4" : ext === ".webm" ? "audio/webm" : "audio/mpeg";
                resolve({ filePath: fallbackPath, contentType: ct });
                return;
            }

            if (error) {
                reject(new Error(`yt-dlp failed: ${error.message}`));
            } else {
                reject(new Error("yt-dlp did not produce output file"));
            }
        });
    });
}

function isYouTubeUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        return (
            parsed.hostname.includes("youtube.com") ||
            parsed.hostname.includes("youtu.be") ||
            parsed.hostname.includes("music.youtube.com")
        );
    } catch {
        return false;
    }
}

function extractYouTubeVideoId(url: string): string | null {
    try {
        const parsed = new URL(url);
        if (parsed.hostname.includes("youtu.be")) {
            return parsed.pathname.slice(1);
        }
        return parsed.searchParams.get("v");
    } catch {
        return null;
    }
}

function cleanYouTubeUrl(url: string): string {
    try {
        const parsed = new URL(url);
        const videoId = extractYouTubeVideoId(url);
        if (videoId && (parsed.hostname.includes("youtube.com") || parsed.hostname.includes("music.youtube.com"))) {
            return `https://www.youtube.com/watch?v=${videoId}`;
        }
        return url;
    } catch {
        return url;
    }
}

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const title = searchParams.get("title");
    const artist = searchParams.get("artist");
    const directUrl = searchParams.get("url");
    const isStream = searchParams.get("stream") === "true";

    if (!title && !artist && !directUrl) {
        return NextResponse.json({ error: "No title/artist or direct URL provided" }, { status: 400 });
    }

    try {
        let videoUrlToDownload = directUrl;

        // 1. Si no hay URL directa y tenemos title+artist, buscar y descargar
        if (!videoUrlToDownload && title && artist) {
            const query = `${artist} - ${title}`;
            console.log("[Search] Buscando:", query);

            // yt-dlp.exe disponible (local/Windows): usar para buscar + descargar
            if (fs.existsSync(YT_DLP_PATH)) {
                try {
                    const searchResult = await searchAndGetStreamUrl(query);
                    console.log("[Search] Encontrado:", searchResult.title, "by", searchResult.uploader);

                    const coverUrl = searchResult.videoId ? `https://i.ytimg.com/vi/${searchResult.videoId}/hqdefault.jpg` : "";
                    const ytUrl = `https://www.youtube.com/watch?v=${searchResult.videoId}`;

                    console.log("[Download] Descargando con yt-dlp:", ytUrl);
                    const { filePath, contentType } = await downloadWithYtDlp(ytUrl);

                    const fileBuffer = fs.readFileSync(filePath);
                    console.log("[Download] Archivo listo:", filePath, "Size:", fileBuffer.length, "bytes");

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
                    console.error("[Search] yt-dlp failed:", err.message);
                    return NextResponse.json({ error: "No se pudo descargar la canción" }, { status: 500 });
                }
            } else {
                // Vercel/serverless: usar youtubei.js (Innertube)
                console.log("[Download] Using youtubei.js (Innertube) for Vercel...");
                try {
                    const result = await searchAndStreamWithInnertube(query);

                    const headers: Record<string, string> = {
                        "Content-Type": result.contentType,
                        "X-Video-Title": encodeURIComponent(result.title),
                        "X-Video-Artist": encodeURIComponent(result.artist),
                        "X-Video-Cover": result.coverUrl,
                        "Access-Control-Expose-Headers": "X-Video-Title, X-Video-Artist, X-Video-Cover, Content-Length",
                    };

                    if (result.contentLength) {
                        headers["Content-Length"] = result.contentLength;
                    }

                    return new NextResponse(result.stream, {
                        status: 200,
                        headers,
                    });
                } catch (innertubeErr: any) {
                    console.error("[Innertube] Failed:", innertubeErr.message);

                    // Last resort: try ytdl-core + yt-search
                    try {
                        console.log("[Download] Innertube failed, trying ytdl-core fallback...");
                        const ytdl = (await import('@distube/ytdl-core')).default;
                        const yts = (await import('yt-search')).default;
                        const r = await yts(query);
                        if (r.videos.length === 0) {
                            return NextResponse.json({ error: "No video found" }, { status: 404 });
                        }
                        videoUrlToDownload = r.videos[0].url;
                    } catch (ytdlErr: any) {
                        console.error("[ytdl-core] Also failed:", ytdlErr.message);
                        return NextResponse.json({ error: "All YouTube backends failed" }, { status: 500 });
                    }
                }
            }
        }

        if (!videoUrlToDownload) {
            return NextResponse.json({ error: "Failed to determine video URL" }, { status: 500 });
        }

        // 2. Si es una URL de YouTube, descargar
        if (isYouTubeUrl(videoUrlToDownload)) {
            videoUrlToDownload = cleanYouTubeUrl(videoUrlToDownload);
            console.log("[Download] Iniciando descarga para:", videoUrlToDownload);

            const videoId = extractYouTubeVideoId(videoUrlToDownload);
            const coverUrl = videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : "";

            // Vercel: usar Innertube para streaming
            if (process.env.VERCEL || !fs.existsSync(YT_DLP_PATH)) {
                console.log("[Download] Streaming with Innertube (Vercel)...");

                if (videoId) {
                    try {
                        const result = await streamWithInnertube(videoId);

                        const headers: Record<string, string> = {
                            "Content-Type": result.contentType,
                            "X-Video-Title": encodeURIComponent(result.title),
                            "X-Video-Artist": encodeURIComponent(result.artist),
                            "X-Video-Cover": coverUrl,
                            "Access-Control-Expose-Headers": "X-Video-Title, X-Video-Artist, X-Video-Cover, Content-Length",
                        };

                        if (result.contentLength) {
                            headers["Content-Length"] = result.contentLength;
                        }

                        return new NextResponse(result.stream, {
                            status: 200,
                            headers,
                        });
                    } catch (err: any) {
                        console.error("[Innertube stream] Error:", err.message);
                        // Fall through to ytdl-core
                    }
                }

                // Fallback: ytdl-core
                try {
                    console.log("[Download] Fallback to ytdl-core...");
                    const ytdl = (await import('@distube/ytdl-core')).default;
                    const info = await ytdl.getInfo(videoUrlToDownload);
                    const format = ytdl.chooseFormat(info.formats, { quality: 'highestaudio', filter: 'audioonly' });

                    if (!format || !format.url) throw new Error("No audio format found");

                    const audioResponse = await fetch(format.url);
                    if (!audioResponse.ok) throw new Error("Failed to fetch YouTube audio");

                    const metadata = await getVideoMetadata(videoUrlToDownload);

                    const headers: Record<string, string> = {
                        "Content-Type": format.mimeType || 'audio/webm',
                        "X-Video-Title": encodeURIComponent(metadata.title),
                        "X-Video-Artist": encodeURIComponent(metadata.uploader),
                        "X-Video-Cover": coverUrl,
                        "Access-Control-Expose-Headers": "X-Video-Title, X-Video-Artist, X-Video-Cover",
                    };

                    if (format.contentLength) {
                        headers["Content-Length"] = format.contentLength;
                    }

                    return new NextResponse(audioResponse.body, {
                        status: 200,
                        headers,
                    });
                } catch (ytdlErr: any) {
                    console.error("[ytdl-core] Failed:", ytdlErr.message);
                    return NextResponse.json({ error: "YouTube download failed on all backends" }, { status: 500 });
                }
            }

            // Windows/Local: descargar con yt-dlp
            console.log("[Download] Descargando con yt-dlp.exe...");
            const [{ filePath, contentType }, metadata] = await Promise.all([
                downloadWithYtDlp(videoUrlToDownload),
                getVideoMetadata(videoUrlToDownload)
            ]);

            const fileBuffer = fs.readFileSync(filePath);
            console.log("[Download] Archivo descargado:", filePath, "Size:", fileBuffer.length, "bytes");

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

        // 3. Fallback: enlace directo
        console.log("[Download] Fetching direct URL:", videoUrlToDownload);
        const response = await fetch(videoUrlToDownload);
        if (!response.ok) {
            return NextResponse.json({ error: "Failed to fetch remote audio stream" }, { status: response.status });
        }

        return new NextResponse(response.body, {
            status: 200,
            headers: {
                "Content-Type": response.headers.get("Content-Type") || "audio/mpeg",
            },
        });

    } catch (error: any) {
        console.error("[Download] Error:", error);
        return NextResponse.json({ error: error.message || "Failed to download stream" }, { status: 500 });
    }
}

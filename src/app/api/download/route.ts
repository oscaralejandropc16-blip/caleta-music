import { NextRequest, NextResponse } from "next/server";
// yt-search removed — uses yt-dlp for search instead
import { execFile } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";

// Forzar el runtime de Node.js
export const runtime = 'nodejs';

// Ruta al binario yt-dlp (raíz del proyecto)
const YT_DLP_PATH = path.join(process.cwd(), "yt-dlp.exe");

async function downloadWithYtdlCore(videoUrl: string): Promise<{ stream: ReadableStream<Uint8Array>, contentType: string, contentLength: string }> {
    const ytdl = (await import('@distube/ytdl-core')).default;
    const info = await ytdl.getInfo(videoUrl);

    // get best audio format
    const format = ytdl.chooseFormat(info.formats, { quality: 'highestaudio', filter: 'audioonly' });

    if (!format || !format.url) {
        throw new Error("No audio format found");
    }

    const response = await fetch(format.url);
    if (!response.ok) throw new Error("Failed to fetch stream from YouTube");

    return {
        stream: response.body as ReadableStream<Uint8Array>,
        contentType: format.mimeType || 'audio/webm',
        contentLength: format.contentLength || response.headers.get('content-length') || ""
    };
}

/**
 * Obtiene metadatos del video (título y uploader) usando yt-dlp.
 */
async function getVideoMetadata(videoUrl: string): Promise<{ title: string; uploader: string }> {
    // Si estamos en Vercel, usamos ytdl-core para los metadatos porque yt-dlp.exe no funcionará
    if (process.env.VERCEL || !fs.existsSync(YT_DLP_PATH)) {
        try {
            const ytdl = (await import('@distube/ytdl-core')).default;
            const info = await ytdl.getInfo(videoUrl);
            return {
                title: info.videoDetails.title || "Enlace Descargado",
                uploader: info.videoDetails.author.name || "Desconocido"
            };
        } catch {
            return { title: "Enlace Descargado", uploader: "Desconocido" };
        }
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
 * Usa yt-dlp para buscar en YouTube y obtener la URL de streaming directa
 * en un solo paso. Mucho más rápido y confiable que yt-search.
 */
async function searchAndGetStreamUrl(query: string): Promise<{ streamUrl: string; title: string; uploader: string; videoId: string }> {
    return new Promise((resolve, reject) => {
        // ytsearch1: busca en YouTube y se queda con el primer resultado
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

async function getStreamUrlWithYtDlp(videoUrl: string): Promise<string> {
    return new Promise((resolve, reject) => {
        execFile(YT_DLP_PATH, [
            "--encoding", "utf8",
            "--no-playlist",
            "-f", "ba",
            "--no-warnings",
            "--print", "url",
            videoUrl
        ], {
            timeout: 15000,
        }, (error, stdout, stderr) => {
            if (error) {
                console.error("[yt-dlp] Error getting URL:", error.message);
                reject(new Error(`yt-dlp failed: ${error.message}`));
                return;
            }

            const urls = stdout.split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("WARNING:"));
            if (urls.length > 0) {
                resolve(urls[urls.length - 1]);
            } else {
                reject(new Error("yt-dlp didn't output a valid URL"));
            }
        });
    });
}

/**
 * Descarga el audio completo con yt-dlp a un archivo temporal,
 * luego lo sirve. Más confiable que proxy directo porque yt-dlp
 * maneja las restricciones del CDN de YouTube internamente.
 */
async function downloadWithYtDlp(videoUrl: string): Promise<{ filePath: string; contentType: string }> {
    const uniqueId = `mv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const tmpFile = path.join(os.tmpdir(), `${uniqueId}.%(ext)s`);

    return new Promise((resolve, reject) => {
        const args = [
            "--encoding", "utf8",
            "--no-playlist",
            "-f", "ba",              // best audio
            "-o", tmpFile,
            "--no-warnings",
            "--force-overwrites",
            "--print", "after_move:filepath",
            videoUrl
        ];

        console.log("[yt-dlp] Downloading:", videoUrl);

        execFile(YT_DLP_PATH, args, {
            timeout: 90000,  // 90s max
        }, (error, stdout, stderr) => {
            if (error) {
                console.error("[yt-dlp] Error:", error.message);
                // Aún podría haber descargado el archivo antes del error (ej: post-process warning)
                // Intentar encontrar el archivo de todas formas
            }

            // Intentar usar stdout
            const outputPath = stdout?.trim();
            if (outputPath && fs.existsSync(outputPath)) {
                console.log("[yt-dlp] Downloaded to:", outputPath);
                const ext = path.extname(outputPath).toLowerCase();
                const contentType = ext === ".m4a" ? "audio/mp4" : ext === ".webm" ? "audio/webm" : "audio/mpeg";
                resolve({ filePath: outputPath, contentType });
                return;
            }

            // Fallback: buscar el archivo con el uniqueId en el tmp dir
            const tmpDir = os.tmpdir();
            const files = fs.readdirSync(tmpDir).filter(f => f.startsWith(uniqueId));
            if (files.length > 0) {
                const fallbackPath = path.join(tmpDir, files[0]);
                console.log("[yt-dlp] Fallback file found:", fallbackPath, "size:", fs.statSync(fallbackPath).size, "bytes");
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

/**
 * Verifica si una URL es de YouTube
 */
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

/**
 * Extrae el video ID de una URL de YouTube
 */
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

/**
 * Limpia una URL de YouTube, removiendo parámetros de playlist/radio que
 * pueden causar problemas con yt-dlp o hacer que tarde más de lo esperado.
 */
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

        // 1. Si no hay URL directa y tenemos title+artist, usar yt-dlp para buscar y descargar
        if (!videoUrlToDownload && title && artist) {
            const query = `${artist} - ${title}`;
            console.log("[Search] Buscando con yt-dlp:", query);

            // yt-dlp.exe available: use it for search + download
            if (fs.existsSync(YT_DLP_PATH)) {
                try {
                    // Paso 1: Buscar y obtener metadatos
                    const searchResult = await searchAndGetStreamUrl(query);
                    console.log("[Search] Encontrado:", searchResult.title, "by", searchResult.uploader);

                    const coverUrl = searchResult.videoId ? `https://i.ytimg.com/vi/${searchResult.videoId}/hqdefault.jpg` : "";
                    const ytUrl = `https://www.youtube.com/watch?v=${searchResult.videoId}`;

                    // Paso 2: Descargar archivo con yt-dlp (más confiable que proxy directo)
                    console.log("[Download] Descargando con yt-dlp:", ytUrl);
                    const { filePath, contentType } = await downloadWithYtDlp(ytUrl);

                    const fileBuffer = fs.readFileSync(filePath);
                    console.log("[Download] Archivo listo:", filePath, "Size:", fileBuffer.length, "bytes");

                    // Limpiar archivo temporal
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
                // Fallback for Vercel: use ytdl-core search + stream
                try {
                    const ytdl = (await import('@distube/ytdl-core')).default;
                    // Use yt-search as last resort on Vercel
                    const yts = (await import('yt-search')).default;
                    const r = await yts(query);
                    if (r.videos.length === 0) {
                        return NextResponse.json({ error: "No video found" }, { status: 404 });
                    }
                    videoUrlToDownload = r.videos[0].url;
                } catch {
                    return NextResponse.json({ error: "Search failed" }, { status: 500 });
                }
            }
        }

        if (!videoUrlToDownload) {
            return NextResponse.json({ error: "Failed to determine video URL" }, { status: 500 });
        }

        // 2. Si es una URL de YouTube, descargar
        if (isYouTubeUrl(videoUrlToDownload)) {
            // Limpiar URL de YouTube: quitar parámetros de playlist/radio
            videoUrlToDownload = cleanYouTubeUrl(videoUrlToDownload);
            console.log("[Download] Iniciando descarga para:", videoUrlToDownload);

            // Obtener thumbnail de YouTube
            const videoId = extractYouTubeVideoId(videoUrlToDownload);
            const coverUrl = videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : "";

            // Lógica rápida para streaming usando ytdl-core (Vercel/Linux)
            if (process.env.VERCEL || !fs.existsSync(YT_DLP_PATH)) {
                console.log("[Download] Usando ytdl-core fallback (Vercel/Linux)");
                const [ytdlData, metadata] = await Promise.all([
                    downloadWithYtdlCore(videoUrlToDownload),
                    getVideoMetadata(videoUrlToDownload)
                ]);

                const headers: Record<string, string> = {
                    "Content-Type": ytdlData.contentType,
                    "X-Video-Title": encodeURIComponent(metadata.title),
                    "X-Video-Artist": encodeURIComponent(metadata.uploader),
                    "X-Video-Cover": coverUrl,
                    "Access-Control-Expose-Headers": "X-Video-Title, X-Video-Artist, X-Video-Cover",
                };

                if (ytdlData.contentLength) {
                    headers["Content-Length"] = ytdlData.contentLength;
                }

                return new NextResponse(ytdlData.stream, {
                    status: 200,
                    headers,
                });
            }

            // Windows/Local: descargar con yt-dlp (proxy directo a YouTube CDN falla con ECONNRESET)
            console.log("[Download] Descargando con yt-dlp.exe...");
            const [{ filePath, contentType }, metadata] = await Promise.all([
                downloadWithYtDlp(videoUrlToDownload),
                getVideoMetadata(videoUrlToDownload)
            ]);

            const fileBuffer = fs.readFileSync(filePath);
            console.log("[Download] Archivo descargado:", filePath, "Size:", fileBuffer.length, "bytes");

            // Limpiar archivo temporal
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

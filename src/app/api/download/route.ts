import { NextRequest, NextResponse } from "next/server";
import yts from "yt-search";
import { execFile } from "child_process";
import { promisify } from "util";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";

// Forzar el runtime de Node.js
export const runtime = 'nodejs';

// Ruta al binario yt-dlp (raíz del proyecto)
const YT_DLP_PATH = path.join(process.cwd(), "yt-dlp.exe");

/**
 * Obtiene metadatos del video (título y uploader) usando yt-dlp.
 */
async function getVideoMetadata(videoUrl: string): Promise<{ title: string; uploader: string }> {
    return new Promise((resolve) => {
        const args = [
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
 * Descarga el audio completo con yt-dlp a un archivo temporal,
 * luego lo sirve como stream. Esto es más confiable que piping stdout
 * porque yt-dlp puede tardar unos segundos en iniciar la descarga.
 */
async function downloadWithYtDlp(videoUrl: string): Promise<{ filePath: string; contentType: string }> {
    const tmpFile = path.join(os.tmpdir(), `musicvault_${Date.now()}.%(ext)s`);

    return new Promise((resolve, reject) => {
        const args = [
            "--no-playlist",
            "-f", "ba",              // best audio (formato nativo de YouTube, sin necesidad de ffmpeg)
            "-o", tmpFile,
            "--no-warnings",
            "--no-progress",
            "--print", "after_move:filepath",  // imprime la ruta final del archivo
            videoUrl
        ];

        console.log("[yt-dlp] Executing:", args.join(" "));

        const proc = execFile(YT_DLP_PATH, args, {
            timeout: 60000,  // 60s max
        }, (error, stdout, stderr) => {
            if (error) {
                console.error("[yt-dlp] Error:", error.message);
                console.error("[yt-dlp] stderr:", stderr);
                reject(new Error(`yt-dlp failed: ${error.message}`));
                return;
            }

            // stdout contiene la ruta del archivo descargado (por --print after_move:filepath)
            const outputPath = stdout.trim();
            console.log("[yt-dlp] Downloaded to:", outputPath);

            if (!outputPath || !fs.existsSync(outputPath)) {
                // Fallback: buscar el archivo temporal con glob 
                const tmpDir = os.tmpdir();
                const prefix = `musicvault_`;
                const files = fs.readdirSync(tmpDir).filter(f => f.startsWith(prefix)).sort().reverse();
                if (files.length > 0) {
                    const fallbackPath = path.join(tmpDir, files[0]);
                    console.log("[yt-dlp] Fallback file found:", fallbackPath);
                    const ext = path.extname(fallbackPath).toLowerCase();
                    const ct = ext === ".m4a" ? "audio/mp4" : ext === ".webm" ? "audio/webm" : "audio/mpeg";
                    resolve({ filePath: fallbackPath, contentType: ct });
                    return;
                }
                reject(new Error("yt-dlp did not produce output file"));
                return;
            }

            const ext = path.extname(outputPath).toLowerCase();
            const contentType = ext === ".m4a" ? "audio/mp4" : ext === ".webm" ? "audio/webm" : "audio/mpeg";
            resolve({ filePath: outputPath, contentType });
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

        // 1. Si no hay URL directa, usar yt-search para encontrarla
        if (!videoUrlToDownload && title && artist) {
            const query = `${artist} - ${title} audio`;
            console.log("[Search] Buscando en YouTube:", query);

            const r = await yts(query);
            const videos = r.videos;

            if (videos.length === 0) {
                return NextResponse.json({ error: "No video found on YouTube for that track" }, { status: 404 });
            }

            videoUrlToDownload = videos[0].url;
            console.log("[Search] Encontrado video:", videoUrlToDownload);
        }

        if (!videoUrlToDownload) {
            return NextResponse.json({ error: "Failed to determine video URL" }, { status: 500 });
        }

        // 2. Si es una URL de YouTube, descargar con yt-dlp
        if (isYouTubeUrl(videoUrlToDownload)) {
            console.log("[Download] Descargando audio con yt-dlp:", videoUrlToDownload);

            // Obtener metadatos y descargar en paralelo
            const [{ filePath, contentType }, metadata] = await Promise.all([
                downloadWithYtDlp(videoUrlToDownload),
                getVideoMetadata(videoUrlToDownload)
            ]);

            // Leer el archivo y enviarlo como respuesta
            const fileBuffer = fs.readFileSync(filePath);
            console.log("[Download] Serving file:", filePath, "Size:", fileBuffer.length, "bytes");
            console.log("[Download] Metadata:", metadata.title, "-", metadata.uploader);

            // Limpiar el archivo temporal después de leerlo
            try { fs.unlinkSync(filePath); } catch { /* ignore */ }

            // Obtener thumbnail de YouTube
            const videoId = extractYouTubeVideoId(videoUrlToDownload);
            const coverUrl = videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : "";

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

        // 3. Fallback: enlace directo (ej: preview de iTunes o web externa)
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

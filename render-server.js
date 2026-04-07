/**
 * Caleta Music – Render YouTube Download API
 * Lightweight Express server that handles ONLY YouTube audio extraction.
 * Uses yt-dlp (Linux binary) + yt-search for metadata resolution.
 * Deployed on Render via Docker (free tier).
 */

const express = require("express");
const cors = require("cors");
const { execFile } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// CORS – allow all origins (Netlify, Capacitor, etc.)
app.use(cors({
    origin: "*",
    methods: ["GET", "OPTIONS"],
    exposedHeaders: ["X-Video-Title", "X-Video-Artist", "X-Video-Cover", "Content-Length", "Content-Range"],
}));

// yt-dlp path (installed via Dockerfile)
const YT_DLP_PATH = "/usr/local/bin/yt-dlp";

// Anti-bot flags: Force iOS and web_creator clients to bypass datacenter IP blocks
const YT_DLP_BASE_ARGS = [
    "--encoding", "utf8",
    "--no-playlist",
    "--no-warnings",
    "--extractor-args", "youtube:player_client=ios,web_creator",
    "--no-check-certificates",
    "--user-agent", "com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X;)",
];

// ============== UTILITY FUNCTIONS ==============

function isYouTubeUrl(url) {
    try {
        const h = new URL(url).hostname;
        return h.includes("youtube.com") || h.includes("youtu.be") || h.includes("music.youtube.com");
    } catch {
        return false;
    }
}

function extractYouTubeVideoId(url) {
    try {
        const parsed = new URL(url);
        if (parsed.hostname.includes("youtu.be")) return parsed.pathname.slice(1).split(/[?#]/)[0];
        const v = parsed.searchParams.get("v");
        if (v) return v;
        if (parsed.pathname.includes("/shorts/")) return parsed.pathname.split("/shorts/")[1].split(/[?#]/)[0];
        if (parsed.pathname.includes("/live/")) return parsed.pathname.split("/live/")[1].split(/[?#]/)[0];
        if (parsed.pathname.includes("/v/")) return parsed.pathname.split("/v/")[1].split(/[?#]/)[0];
        if (parsed.pathname.includes("/embed/")) return parsed.pathname.split("/embed/")[1].split(/[?#]/)[0];
        return null;
    } catch {
        return null;
    }
}

function getVideoMetadata(videoUrl) {
    return new Promise((resolve) => {
        execFile(YT_DLP_PATH, [
            ...YT_DLP_BASE_ARGS,
            "--print", "%(title)s", "--print", "%(uploader)s", "--skip-download", videoUrl
        ], { timeout: 20000 }, (error, stdout) => {
            if (error || !stdout.trim()) {
                resolve({ title: "YouTube Audio", uploader: "YouTube" });
                return;
            }
            const lines = stdout.trim().split("\n");
            resolve({
                title: lines[0]?.trim() || "YouTube Audio",
                uploader: lines[1]?.trim() || "YouTube"
            });
        });
    });
}

function downloadWithYtDlp(videoUrl) {
    const uniqueId = `mv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const tmpFile = path.join(os.tmpdir(), `${uniqueId}.%(ext)s`);

    return new Promise((resolve, reject) => {
        execFile(YT_DLP_PATH, [
            ...YT_DLP_BASE_ARGS,
            "-f", "ba", "-o", tmpFile,
            "--force-overwrites", "--print", "after_move:filepath", videoUrl
        ], { timeout: 90000 }, (error, stdout, stderr) => {
            if (stderr) console.warn(`[yt-dlp stderr] ${stderr.substring(0, 500)}`);

            const outputPath = stdout?.trim();
            if (outputPath && fs.existsSync(outputPath)) {
                const ext = path.extname(outputPath).toLowerCase();
                resolve({
                    filePath: outputPath,
                    contentType: ext === ".m4a" ? "audio/mp4" : ext === ".webm" ? "audio/webm" : "audio/mpeg"
                });
                return;
            }
            const files = fs.readdirSync(os.tmpdir()).filter(f => f.startsWith(uniqueId));
            if (files.length > 0) {
                const fp = path.join(os.tmpdir(), files[0]);
                const ext = path.extname(fp).toLowerCase();
                resolve({
                    filePath: fp,
                    contentType: ext === ".m4a" ? "audio/mp4" : ext === ".webm" ? "audio/webm" : "audio/mpeg"
                });
                return;
            }
            reject(error ? new Error(`yt-dlp: ${error.message}`) : new Error("yt-dlp no output"));
        });
    });
}

function getStreamUrl(videoUrl) {
    return new Promise((resolve, reject) => {
        execFile(YT_DLP_PATH, [
            ...YT_DLP_BASE_ARGS,
            "-f", "ba",
            "--print", "url", videoUrl
        ], { timeout: 20000 }, (err, stdout) => {
            if (err) { reject(err); return; }
            const u = stdout.trim().split("\n")[0];
            if (u && u.startsWith("http")) resolve(u);
            else reject(new Error("no stream url"));
        });
    });
}

// ============== COBALT COMMUNITY FALLBACK ==============

const COBALT_INSTANCES = [
    "https://cobalt.canine.sc",
    "https://co.eepy.today",
    "https://cobalt.starnomi.net"
];

async function tryFallbackCobalt(videoUrl, videoId) {
    for (const instance of COBALT_INSTANCES) {
        try {
            console.log(`[Cobalt] Trying: ${instance}`);
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);

            const res = await fetch(instance, {
                method: "POST",
                headers: { "Accept": "application/json", "Content-Type": "application/json" },
                body: JSON.stringify({ url: videoUrl, isAudioOnly: true, aFormat: "mp3", filenamePattern: "pretty" }),
                signal: controller.signal
            });
            clearTimeout(timeout);

            if (!res.ok) continue;
            const data = await res.json();
            if (data.status === "error") continue;

            if (data.status === "redirect" || data.status === "stream" || data.status === "tunnel") {
                return data.url;
            }
        } catch { continue; }
    }
    return null;
}

// ============== MAIN DOWNLOAD ENDPOINT ==============

app.get("/api/download", async (req, res) => {
    const { url: directUrl, title, artist, play } = req.query;

    if (!directUrl && !title && !artist) {
        return res.status(400).json({ error: "No params provided" });
    }

    try {
        // CASE 1: Direct YouTube Link
        if (directUrl && isYouTubeUrl(directUrl)) {
            const videoId = extractYouTubeVideoId(directUrl);
            console.log(`[Download] YouTube URL detected: ${directUrl}, videoId: ${videoId}`);

            if (!videoId) {
                return res.status(400).json({ error: "Enlace de YouTube inválido." });
            }

            // Get metadata via yt-search (lightweight, never blocked)
            let safeTitle = "YouTube Audio";
            let safeArtist = "YouTube";
            try {
                const yts = require("yt-search");
                const r = await yts({ videoId });
                if (r && r.title) {
                    safeTitle = r.title;
                    safeArtist = r.author?.name || "YouTube";
                }
            } catch { }

            // play=true → redirect to stream URL
            if (play === "true") {
                try {
                    const streamUrl = await getStreamUrl(directUrl);
                    return res.redirect(streamUrl);
                } catch (e) {
                    console.warn(`[Download] yt-dlp stream redirect failed: ${e.message}, trying Cobalt...`);
                    const cobaltUrl = await tryFallbackCobalt(directUrl, videoId);
                    if (cobaltUrl) return res.redirect(cobaltUrl);
                    return res.status(500).json({ error: "No se pudo obtener el stream URL." });
                }
            }

            // Full download → return audio binary
            try {
                const [{ filePath, contentType }, metadata] = await Promise.all([
                    downloadWithYtDlp(directUrl),
                    getVideoMetadata(directUrl)
                ]);
                const fileBuffer = fs.readFileSync(filePath);
                try { fs.unlinkSync(filePath); } catch { }

                const finalTitle = metadata.title !== "YouTube Audio" ? metadata.title : safeTitle;
                const finalArtist = metadata.uploader !== "YouTube" ? metadata.uploader : safeArtist;

                res.set({
                    "Content-Type": contentType,
                    "Content-Length": fileBuffer.length.toString(),
                    "X-Video-Title": encodeURIComponent(finalTitle),
                    "X-Video-Artist": encodeURIComponent(finalArtist),
                    "X-Video-Cover": `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                });
                return res.send(fileBuffer);
            } catch (dlErr) {
                console.error(`[Download] yt-dlp download failed: ${dlErr.message}`);

                // Fallback: proxy from Cobalt
                try {
                    const cobaltUrl = await tryFallbackCobalt(directUrl, videoId);
                    if (cobaltUrl) {
                        console.log(`[Download] Proxying from Cobalt: ${cobaltUrl.substring(0, 80)}...`);
                        const audioRes = await fetch(cobaltUrl);
                        if (!audioRes.ok) throw new Error("Cobalt stream fetch failed");

                        const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
                        res.set({
                            "Content-Type": "audio/mpeg",
                            "Content-Length": audioBuffer.length.toString(),
                            "X-Video-Title": encodeURIComponent(safeTitle),
                            "X-Video-Artist": encodeURIComponent(safeArtist),
                            "X-Video-Cover": `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                        });
                        return res.send(audioBuffer);
                    }
                } catch (cobaltErr) {
                    console.error(`[Download] Cobalt fallback also failed: ${cobaltErr.message}`);
                }

                return res.status(500).json({ error: "No se pudo extraer el audio del enlace de YouTube." });
            }
        }

        // CASE 2: Search by Title + Artist
        if (!directUrl && title && artist) {
            const query = `${artist} - ${title}`;
            console.log(`[Download] Resolving by query: ${query}`);

            // Resolve video ID with yt-search
            let resolvedVideoId = "";
            let resolvedTitle = title;
            let resolvedArtist = artist;
            try {
                const yts = require("yt-search");
                const r = await yts(query);
                const firstVideo = r?.videos?.[0];
                if (firstVideo && firstVideo.videoId) {
                    resolvedVideoId = firstVideo.videoId;
                    resolvedTitle = firstVideo.title || title;
                    resolvedArtist = firstVideo.author?.name || artist;
                }
            } catch (e) {
                console.warn(`[Download] yt-search failed: ${e.message}`);
            }

            if (!resolvedVideoId) {
                return res.status(404).json({ error: "No se encontró el video en YouTube." });
            }

            const ytUrl = `https://www.youtube.com/watch?v=${resolvedVideoId}`;

            // play=true → redirect
            if (play === "true") {
                try {
                    const streamUrl = await getStreamUrl(ytUrl);
                    return res.redirect(streamUrl);
                } catch (e) {
                    console.warn(`[Download] yt-dlp stream redirect failed: ${e.message}, trying Cobalt...`);
                    const cobaltUrl = await tryFallbackCobalt(ytUrl, resolvedVideoId);
                    if (cobaltUrl) return res.redirect(cobaltUrl);
                    return res.status(500).json({ error: "No se pudo obtener el stream URL." });
                }
            }

            // Full download
            try {
                const [{ filePath, contentType }, metadata] = await Promise.all([
                    downloadWithYtDlp(ytUrl),
                    getVideoMetadata(ytUrl).catch(() => ({ title: resolvedTitle, uploader: resolvedArtist }))
                ]);
                const fileBuffer = fs.readFileSync(filePath);
                try { fs.unlinkSync(filePath); } catch { }

                res.set({
                    "Content-Type": contentType,
                    "Content-Length": fileBuffer.length.toString(),
                    "X-Video-Title": encodeURIComponent(metadata.title || resolvedTitle),
                    "X-Video-Artist": encodeURIComponent(metadata.uploader || resolvedArtist),
                    "X-Video-Cover": `https://i.ytimg.com/vi/${resolvedVideoId}/hqdefault.jpg`,
                });
                return res.send(fileBuffer);
            } catch (dlErr) {
                console.error(`[Download] yt-dlp download failed: ${dlErr.message}`);

                // Cobalt fallback
                try {
                    const cobaltUrl = await tryFallbackCobalt(ytUrl, resolvedVideoId);
                    if (cobaltUrl) {
                        const audioRes = await fetch(cobaltUrl);
                        if (!audioRes.ok) throw new Error("Cobalt stream fetch failed");
                        const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
                        res.set({
                            "Content-Type": "audio/mpeg",
                            "Content-Length": audioBuffer.length.toString(),
                            "X-Video-Title": encodeURIComponent(resolvedTitle),
                            "X-Video-Artist": encodeURIComponent(resolvedArtist),
                            "X-Video-Cover": `https://i.ytimg.com/vi/${resolvedVideoId}/hqdefault.jpg`,
                        });
                        return res.send(audioBuffer);
                    }
                } catch (cobaltErr) {
                    console.error(`[Download] Cobalt fallback also failed: ${cobaltErr.message}`);
                }

                return res.status(500).json({ error: "No se pudo descargar el audio." });
            }
        }

        return res.status(400).json({ error: "No valid parameters provided." });

    } catch (err) {
        console.error("[Download] Critical Error:", err);
        return res.status(500).json({ error: err.message || "Failed to download" });
    }
});

// Health check
app.get("/", (req, res) => {
    res.json({ status: "ok", service: "caleta-music-yt-api", ytdlp: fs.existsSync(YT_DLP_PATH) });
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`🎵 Caleta Music YouTube API running on port ${PORT}`);
});

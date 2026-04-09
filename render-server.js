/**
 * Caleta Music – Render YouTube Download API v3
 * Uses youtubei.js (InnerTube API) as PRIMARY extractor.
 * yt-dlp as secondary fallback.
 * Cobalt community instances as last resort.
 */

const express = require("express");
const cors = require("cors");
const { execFile } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
    origin: "*",
    methods: ["GET", "OPTIONS"],
    exposedHeaders: ["X-Video-Title", "X-Video-Artist", "X-Video-Cover", "Content-Length", "Content-Range"],
}));

const YT_DLP_PATH = "/usr/local/bin/yt-dlp";

// ============== YOUTUBEI.JS (InnerTube API) ==============

let innertubeInstance = null;

async function getInnertube() {
    if (!innertubeInstance) {
        const { Innertube } = await import("youtubei.js");
        innertubeInstance = await Innertube.create({
            cache: undefined,
            generate_session_locally: true,
        });
    }
    return innertubeInstance;
}

async function downloadWithInnertube(videoId) {
    console.log(`[Innertube] Attempting download for: ${videoId}`);
    const yt = await getInnertube();
    const info = await yt.getBasicInfo(videoId);

    const title = info.basic_info?.title || "YouTube Audio";
    const artist = info.basic_info?.author || "YouTube";
    const coverUrl = info.basic_info?.thumbnail?.[0]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

    // Get best audio format
    const format = info.chooseFormat({ type: "audio", quality: "best" });
    if (!format || !format.decipher) {
        // Try getting the URL directly
        const streamUrl = format?.url || format?.decipher?.(yt.session.player);
        if (!streamUrl) throw new Error("No audio format found");

        return {
            streamUrl,
            title,
            artist,
            coverUrl,
            contentType: format.mime_type?.split(";")[0] || "audio/mp4",
        };
    }

    const streamUrl = format.decipher(yt.session.player);
    return {
        streamUrl,
        title,
        artist,
        coverUrl,
        contentType: format.mime_type?.split(";")[0] || "audio/mp4",
    };
}

async function streamWithInnertube(videoId) {
    console.log(`[Innertube] Streaming for: ${videoId}`);
    const yt = await getInnertube();
    const info = await yt.getBasicInfo(videoId);

    const title = info.basic_info?.title || "YouTube Audio";
    const artist = info.basic_info?.author || "YouTube";

    const format = info.chooseFormat({ type: "audio", quality: "best" });
    if (!format) throw new Error("No audio format available");

    // Download as buffer
    const stream = await info.download({ type: "audio", quality: "best" });
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    return {
        buffer,
        title,
        artist,
        coverUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        contentType: format.mime_type?.split(";")[0] || "audio/mp4",
    };
}

// ============== YT-DLP FALLBACK ==============

const YT_DLP_BASE_ARGS = [
    "--encoding", "utf8", "--no-playlist", "--no-warnings",
    "--extractor-args", "youtube:player_client=ios,web_creator",
    "--no-check-certificates",
];

function downloadWithYtDlp(videoUrl) {
    const uniqueId = `mv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const tmpFile = path.join(os.tmpdir(), `${uniqueId}.%(ext)s`);
    return new Promise((resolve, reject) => {
        execFile(YT_DLP_PATH, [
            ...YT_DLP_BASE_ARGS, "-f", "ba", "-o", tmpFile,
            "--force-overwrites", "--print", "after_move:filepath", videoUrl
        ], { timeout: 60000 }, (error, stdout) => {
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

// ============== COBALT FALLBACK ==============

const COBALT_INSTANCES = ["https://cobalt.canine.sc", "https://co.eepy.today", "https://cobalt.starnomi.net"];

async function tryFallbackCobalt(videoUrl) {
    for (const instance of COBALT_INSTANCES) {
        try {
            console.log(`[Cobalt] Trying: ${instance}`);
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 6000);
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
            if (data.url) return data.url;
        } catch { continue; }
    }
    return null;
}

// ============== UTILITIES ==============

function isYouTubeUrl(url) {
    try { const h = new URL(url).hostname; return h.includes("youtube.com") || h.includes("youtu.be") || h.includes("music.youtube.com"); } catch { return false; }
}

function extractYouTubeVideoId(url) {
    try {
        const parsed = new URL(url);
        if (parsed.hostname.includes("youtu.be")) return parsed.pathname.slice(1).split(/[?#]/)[0];
        const v = parsed.searchParams.get("v"); if (v) return v;
        if (parsed.pathname.includes("/shorts/")) return parsed.pathname.split("/shorts/")[1].split(/[?#]/)[0];
        if (parsed.pathname.includes("/live/")) return parsed.pathname.split("/live/")[1].split(/[?#]/)[0];
        return null;
    } catch { return null; }
}

// ============== MAIN ENDPOINT ==============

app.get("/api/download", async (req, res) => {
    const { url: directUrl, title, artist, play } = req.query;
    if (!directUrl && !title && !artist) return res.status(400).json({ error: "No params provided" });

    try {
        let videoId = null;
        let safeTitle = title || "YouTube Audio";
        let safeArtist = artist || "YouTube";

        // Resolve videoId
        if (directUrl && isYouTubeUrl(directUrl)) {
            videoId = extractYouTubeVideoId(directUrl);
        } else if (title && artist) {
            // Search by title+artist using yt-search
            try {
                const yts = require("yt-search");
                const r = await yts(`${artist} - ${title}`);
                const first = r?.videos?.[0];
                if (first) {
                    videoId = first.videoId;
                    safeTitle = first.title || title;
                    safeArtist = first.author?.name || artist;
                }
            } catch (e) { console.warn(`[yt-search] ${e.message}`); }
        }

        if (!videoId) {
            return res.status(404).json({ error: "No se pudo encontrar el video." });
        }

        console.log(`[Download] Processing videoId: ${videoId}, play=${play}`);
        const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;

        // ── STRATEGY 1: youtubei.js (InnerTube API) ──
        try {
            if (play === "true") {
                // Get direct stream URL for audio element
                const result = await downloadWithInnertube(videoId);
                if (result.streamUrl) {
                    return res.redirect(result.streamUrl);
                }
            }

            // Full download as buffer
            const result = await streamWithInnertube(videoId);
            res.set({
                "Content-Type": result.contentType,
                "Content-Length": result.buffer.length.toString(),
                "X-Video-Title": encodeURIComponent(result.title),
                "X-Video-Artist": encodeURIComponent(result.artist),
                "X-Video-Cover": result.coverUrl,
            });
            return res.send(result.buffer);
        } catch (innertubeErr) {
            console.warn(`[Innertube] Failed: ${innertubeErr.message}`);
            // Reset instance on failure to force re-auth
            innertubeInstance = null;
        }

        // ── STRATEGY 2: yt-dlp with iOS spoofing ──
        if (fs.existsSync(YT_DLP_PATH)) {
            try {
                if (play === "true") {
                    const streamUrl = await new Promise((resolve, reject) => {
                        execFile(YT_DLP_PATH, [...YT_DLP_BASE_ARGS, "-f", "ba", "--print", "url", ytUrl],
                            { timeout: 20000 }, (err, stdout) => {
                                if (err) { reject(err); return; }
                                const u = stdout.trim().split("\n")[0];
                                if (u && u.startsWith("http")) resolve(u); else reject(new Error("no url"));
                            });
                    });
                    return res.redirect(streamUrl);
                }

                const { filePath, contentType } = await downloadWithYtDlp(ytUrl);
                const fileBuffer = fs.readFileSync(filePath);
                try { fs.unlinkSync(filePath); } catch { }
                res.set({
                    "Content-Type": contentType,
                    "Content-Length": fileBuffer.length.toString(),
                    "X-Video-Title": encodeURIComponent(safeTitle),
                    "X-Video-Artist": encodeURIComponent(safeArtist),
                    "X-Video-Cover": `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                });
                return res.send(fileBuffer);
            } catch (ytdlpErr) {
                console.warn(`[yt-dlp] Failed: ${ytdlpErr.message}`);
            }
        }

        // ── STRATEGY 3: Cobalt community ──
        try {
            const cobaltUrl = await tryFallbackCobalt(ytUrl);
            if (cobaltUrl) {
                if (play === "true") return res.redirect(cobaltUrl);

                console.log(`[Cobalt] Proxying audio from: ${cobaltUrl.substring(0, 80)}...`);
                const audioRes = await fetch(cobaltUrl);
                if (audioRes.ok) {
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
            }
        } catch (cobaltErr) {
            console.warn(`[Cobalt] Failed: ${cobaltErr.message}`);
        }

        return res.status(500).json({ error: "Todos los métodos de extracción fallaron." });

    } catch (err) {
        console.error("[Download] Critical:", err);
        return res.status(500).json({ error: err.message || "Error desconocido" });
    }
});

// Health check
app.get("/", (req, res) => {
    res.json({ status: "ok", service: "caleta-music-yt-api-v3", ytdlp: fs.existsSync(YT_DLP_PATH) });
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`🎵 Caleta Music YouTube API v3 running on port ${PORT}`);
});

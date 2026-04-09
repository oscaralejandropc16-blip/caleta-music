/**
 * Caleta Music – Render YouTube Download API v4
 * Uses yt-dlp with YouTube session cookies to bypass bot detection.
 * Falls back to youtubei.js and Cobalt community instances.
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

let YT_DLP_PATH = "/usr/local/bin/yt-dlp";

async function ensureYtDlp() {
    return new Promise((resolve) => {
        const customPath = path.join(os.tmpdir(), "yt-dlp_custom");
        if (os.platform() === "win32") {
            YT_DLP_PATH = path.join(__dirname, "yt-dlp.exe");
            resolve();
            return;
        }

        const isRecent = fs.existsSync(customPath) && (Date.now() - fs.statSync(customPath).mtimeMs < 24 * 60 * 60 * 1000);
        if (isRecent) {
            console.log("[yt-dlp] Using cached recent yt-dlp in tmp");
            YT_DLP_PATH = customPath;
            resolve();
            return;
        }

        console.log("[yt-dlp] Downloading latest yt-dlp_linux release to bypass dependencies...");
        const cmd = `curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux -o ${customPath} && chmod a+rx ${customPath}`;

        const { exec } = require("child_process");
        exec(cmd, (err) => {
            if (err) {
                console.warn("[yt-dlp] Failed to download dynamically: " + err.message);
            } else {
                console.log("[yt-dlp] Automatically downloaded latest yt-dlp version successfully!");
                YT_DLP_PATH = customPath;
            }
            resolve();
        });
    });
}

// Write cookies from env var to file on startup
function setupCookies() {
    const cookiesEnv = process.env.YT_COOKIES;
    if (cookiesEnv) {
        try {
            // Support both base64 and raw Netscape format
            let cookieContent = cookiesEnv;
            if (!cookiesEnv.includes("youtube.com")) {
                // Likely base64 encoded
                cookieContent = Buffer.from(cookiesEnv, "base64").toString("utf-8");
            }
            fs.writeFileSync(COOKIES_FILE, cookieContent, "utf-8");
            console.log(`[Cookies] Written ${cookieContent.length} bytes to ${COOKIES_FILE}`);
            return true;
        } catch (e) {
            console.error(`[Cookies] Failed to write: ${e.message}`);
        }
    } else {
        console.warn("[Cookies] YT_COOKIES env var not set. yt-dlp will likely fail on datacenter IPs.");
    }
    return false;
}

const hasCookies = setupCookies();

// Base yt-dlp args
function getYtDlpArgs() {
    const args = [
        "--encoding", "utf8", "--no-playlist", "--no-warnings",
        "--no-check-certificates",
        "--extractor-args", "youtube:player_client=ios,web_creator",
    ];
    if (hasCookies && fs.existsSync(COOKIES_FILE)) {
        args.push("--cookies", COOKIES_FILE);
    }
    return args;
}

// ============== UTILITY FUNCTIONS ==============

function isYouTubeUrl(url) {
    try {
        const h = new URL(url).hostname;
        return h.includes("youtube.com") || h.includes("youtu.be") || h.includes("music.youtube.com");
    } catch { return false; }
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

// ============== YT-DLP FUNCTIONS ==============

function getStreamUrl(videoUrl) {
    return new Promise((resolve, reject) => {
        execFile(YT_DLP_PATH, [...getYtDlpArgs(), "-f", "ba", "--print", "url", videoUrl],
            { timeout: 25000 }, (err, stdout, stderr) => {
                if (stderr) console.warn(`[yt-dlp stderr] ${stderr.substring(0, 300)}`);
                if (err) { reject(err); return; }
                const u = stdout.trim().split("\n")[0];
                if (u && u.startsWith("http")) resolve(u);
                else reject(new Error("no stream url"));
            });
    });
}

function downloadWithYtDlp(videoUrl) {
    const uniqueId = `mv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const tmpFile = path.join(os.tmpdir(), `${uniqueId}.%(ext)s`);
    return new Promise((resolve, reject) => {
        execFile(YT_DLP_PATH, [
            ...getYtDlpArgs(), "-f", "ba", "-o", tmpFile,
            "--force-overwrites", "--print", "after_move:filepath", videoUrl
        ], { timeout: 90000 }, (error, stdout, stderr) => {
            if (stderr) console.warn(`[yt-dlp stderr] ${stderr.substring(0, 300)}`);
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

function getVideoMetadata(videoUrl) {
    return new Promise((resolve) => {
        execFile(YT_DLP_PATH, [
            ...getYtDlpArgs(), "--print", "%(title)s", "--print", "%(uploader)s", "--skip-download", videoUrl
        ], { timeout: 20000 }, (error, stdout) => {
            if (error || !stdout.trim()) { resolve({ title: "YouTube Audio", uploader: "YouTube" }); return; }
            const lines = stdout.trim().split("\n");
            resolve({ title: lines[0]?.trim() || "YouTube Audio", uploader: lines[1]?.trim() || "YouTube" });
        });
    });
}

// ============== COBALT FALLBACK ==============

const COBALT_INSTANCES = ["https://cobalt.canine.sc", "https://co.eepy.today", "https://cobalt.starnomi.net"];

async function tryFallbackCobalt(videoUrl) {
    // Return early, Cobalt community instances are increasingly blocking API/unauth usage or 502ing
    return null;
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
            // Get metadata
            try {
                const yts = require("yt-search");
                const r = await yts({ videoId });
                if (r && r.title) { safeTitle = r.title; safeArtist = r.author?.name || "YouTube"; }
            } catch { }
        } else if (title && artist) {
            try {
                const yts = require("yt-search");
                const r = await yts(`${artist} - ${title}`);
                const first = r?.videos?.[0];
                if (first) { videoId = first.videoId; safeTitle = first.title || title; safeArtist = first.author?.name || artist; }
            } catch (e) { console.warn(`[yt-search] ${e.message}`); }
        }

        if (!videoId) return res.status(404).json({ error: "No se pudo encontrar el video." });

        console.log(`[Download] Processing videoId: ${videoId}, play=${play}, cookies=${hasCookies}`);
        const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;

        // ── STRATEGY 1: yt-dlp with cookies (Always used natively to bypass) ──
        if (fs.existsSync(YT_DLP_PATH)) {
            try {
                if (play === "true") {
                    const streamUrl = await getStreamUrl(ytUrl);
                    return res.redirect(streamUrl);
                }
                const [{ filePath, contentType }, metadata] = await Promise.all([
                    downloadWithYtDlp(ytUrl),
                    getVideoMetadata(ytUrl).catch(() => ({ title: safeTitle, uploader: safeArtist }))
                ]);
                const fileBuffer = fs.readFileSync(filePath);
                try { fs.unlinkSync(filePath); } catch { }
                res.set({
                    "Content-Type": contentType,
                    "Content-Length": fileBuffer.length.toString(),
                    "X-Video-Title": encodeURIComponent(metadata.title || safeTitle),
                    "X-Video-Artist": encodeURIComponent(metadata.uploader || safeArtist),
                    "X-Video-Cover": `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                });
                return res.send(fileBuffer);
            } catch (ytdlpErr) {
                console.warn(`[yt-dlp] Failed: ${ytdlpErr.message}`);
                return res.status(500).json({ error: "No se pudo extraer el audio (yt-dlp falló, posible bloqueo captcha/IP o token PO requerido)." });
            }
        }

        return res.status(500).json({ error: "yt-dlp no está instalado o no se pudo descargar." });

    } catch (err) {
        console.error("[Download] Critical:", err);
        return res.status(500).json({ error: err.message || "Error desconocido" });
    }
});

// Health + cookie instructions
app.get("/", (req, res) => {
    res.json({
        status: "ok",
        service: "caleta-music-yt-api-v4",
        ytdlp_path: YT_DLP_PATH,
        cookies: hasCookies,
        instructions: !hasCookies ? "Set YT_COOKIES env var in Render with your YouTube cookies" : undefined
    });
});

ensureYtDlp().then(() => {
    app.listen(PORT, "0.0.0.0", () => {
        console.log(`🎵 Caleta Music YouTube API v4 running on port ${PORT}`);
        console.log(`   Cookies: ${hasCookies ? "✅ Loaded" : "❌ Not set (downloads may fail without them)"}`);
        console.log(`   yt-dlp: ${fs.existsSync(YT_DLP_PATH) ? "✅ Configured at " + YT_DLP_PATH : "❌ Missing"}`);
    });
});

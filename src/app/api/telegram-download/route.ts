import { NextRequest, NextResponse } from "next/server";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";

// Vercel hobby plan: max 60s
export const maxDuration = 60;
// Must use Node.js runtime (not Edge) for GramJS
export const runtime = "nodejs";

const API_ID = parseInt(process.env.TELEGRAM_API_ID || "0");
const API_HASH = process.env.TELEGRAM_API_HASH || "";
const SESSION_STRING = process.env.TELEGRAM_SESSION || "";
const YT_BOT = "BotYouTubeMusicBot"; // sin el @

export async function GET(req: NextRequest) {
    const videoUrl = req.nextUrl.searchParams.get("url") || "";
    const videoId = req.nextUrl.searchParams.get("id") || "";

    const ytUrl = videoUrl || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : "");

    if (!ytUrl) {
        return NextResponse.json({ error: "Se requiere url o id" }, { status: 400 });
    }

    if (!SESSION_STRING || !API_ID || !API_HASH) {
        return NextResponse.json(
            { error: "Telegram no configurado. Contacta al administrador." },
            { status: 503 }
        );
    }

    const client = new TelegramClient(new StringSession(SESSION_STRING), API_ID, API_HASH, {
        connectionRetries: 3,
    });

    try {
        await client.connect();

        const sentAt = Math.floor(Date.now() / 1000);

        // Enviar el link de YouTube al bot
        await client.sendMessage(YT_BOT, { message: ytUrl });

        // Polling: esperar hasta 52 segundos la respuesta de audio
        let audioMsg: any = null;
        const deadline = Date.now() + 52_000;

        while (Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, 3000));

            const messages = await client.getMessages(YT_BOT, { limit: 5 });

            // Buscar mensaje de audio enviado DESPUÉS de nuestra solicitud
            const found = messages.find(
                (m: any) =>
                    m.document &&
                    m.date >= sentAt - 2
            );

            if (found) {
                audioMsg = found;
                break;
            }
        }

        if (!audioMsg) {
            await client.disconnect();
            return NextResponse.json(
                { error: "El bot de Telegram no respondió a tiempo. Intenta de nuevo." },
                { status: 504 }
            );
        }

        // Extraer metadatos del documento (título, artista)
        let title = "Descarga de YouTube";
        let artist = "YouTube";

        try {
            const attrs = (audioMsg.document?.attributes || []) as any[];
            const audioAttr = attrs.find(
                (a: any) => a.className === "DocumentAttributeAudio" || a.title
            );
            if (audioAttr?.title) title = audioAttr.title;
            if (audioAttr?.performer) artist = audioAttr.performer;

            // Si el caption del mensaje tiene info útil
            if (audioMsg.message && !audioAttr?.title) {
                const lines = audioMsg.message.split("\n").filter(Boolean);
                if (lines[0]) title = lines[0].replace(/[*_`]/g, "").trim();
            }
        } catch { }

        // Descargar el archivo de audio desde Telegram
        const rawBuf = (await client.downloadMedia(audioMsg, {})) as Buffer;
        await client.disconnect();

        if (!rawBuf || rawBuf.length === 0) {
            return NextResponse.json({ error: "El archivo de audio está vacío" }, { status: 500 });
        }

        // Buffer → ArrayBuffer puro → Blob (evita problemas de tipos de SharedArrayBuffer)
        const arrayBuf = rawBuf.buffer.slice(rawBuf.byteOffset, rawBuf.byteOffset + rawBuf.byteLength) as ArrayBuffer;
        const audioBlob = new Blob([arrayBuf], { type: "audio/mpeg" });

        const headers = new Headers({
            "Content-Type": "audio/mpeg",
            "Content-Length": rawBuf.length.toString(),
            "x-video-title": encodeURIComponent(title),
            "x-video-artist": encodeURIComponent(artist),
            "Cache-Control": "no-store",
        });

        return new NextResponse(audioBlob, { status: 200, headers });
    } catch (err: any) {
        try {
            await client.disconnect();
        } catch { }
        console.error("[telegram-download] Error:", err);
        return NextResponse.json({ error: err.message || "Error desconocido" }, { status: 500 });
    }
}

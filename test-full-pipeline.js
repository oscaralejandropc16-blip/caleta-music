async function test() {
    // Step 1: Get audio info from Invidious
    console.log("1. Getting video info...");
    const r = await fetch("https://inv.thepixora.com/api/v1/videos/kJQP7kiw5Fk", {
        signal: AbortSignal.timeout(8000)
    });
    const d = await r.json();
    const audio = d.adaptiveFormats.filter(f => f.type?.startsWith("audio/") && f.url);
    console.log("   Found", audio.length, "audio streams");
    const best = audio.sort((a, b) => (parseInt(b.bitrate) || 0) - (parseInt(a.bitrate) || 0))[0];
    const localUrl = `https://inv.thepixora.com/latest_version?id=kJQP7kiw5Fk&itag=${best.itag}&local=true`;
    console.log("   Best:", best.type, "@", best.bitrate, "bps");

    // Step 2: Test direct fetch from Invidious (simulating what Vercel proxy does)
    console.log("2. Testing direct stream from Invidious...");
    const sr = await fetch(localUrl, {
        headers: { "Range": "bytes=0-10000" },
        signal: AbortSignal.timeout(15000)
    });
    console.log("   Status:", sr.status);
    console.log("   Content-Type:", sr.headers.get("content-type"));
    console.log("   Content-Length:", sr.headers.get("content-length"));
    const buf = await sr.arrayBuffer();
    console.log("   Downloaded:", buf.byteLength, "bytes");

    // Step 3: Test audio proxy on Vercel
    console.log("3. Testing Vercel audio proxy...");
    const proxyUrl = `https://caleta-music.vercel.app/api/audio-proxy?url=${encodeURIComponent(localUrl)}`;
    const pr = await fetch(proxyUrl, {
        headers: { "Range": "bytes=0-10000" },
        signal: AbortSignal.timeout(15000)
    });
    console.log("   Proxy Status:", pr.status);
    console.log("   Proxy Content-Type:", pr.headers.get("content-type"));
    const pbuf = await pr.arrayBuffer();
    console.log("   Proxy Downloaded:", pbuf.byteLength, "bytes");
    console.log("\n✅ FULL PIPELINE WORKS!");
}
test().catch(e => console.log("❌ FAILED:", e.message));

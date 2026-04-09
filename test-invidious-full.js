// Quick test: can the browser directly call Invidious APIs?
async function test() {
    const instances = [
        "https://inv.thepixora.com",
        "https://inv.nadeko.net",
        "https://invidious.jing.rocks",
        "https://iv.datura.network",
        "https://invidious.nerdvpn.de",
    ];

    for (const inst of instances) {
        try {
            const start = Date.now();
            const res = await fetch(`${inst}/api/v1/videos/kJQP7kiw5Fk`, {
                signal: AbortSignal.timeout(5000)
            });
            if (res.ok) {
                const data = await res.json();
                const audio = (data.adaptiveFormats || []).filter(f => f.type?.startsWith("audio/") && f.url);
                if (audio.length > 0) {
                    const best = audio.sort((a, b) => (parseInt(b.bitrate) || 0) - (parseInt(a.bitrate) || 0))[0];
                    const localUrl = `${inst}/latest_version?id=kJQP7kiw5Fk&itag=${best.itag}&local=true`;

                    // Test if audio stream works
                    const streamRes = await fetch(localUrl, { method: "HEAD", signal: AbortSignal.timeout(5000) });
                    console.log(`✅ ${inst} -> ${streamRes.status} ${streamRes.headers.get("content-type")} (${Date.now() - start}ms)`);
                } else {
                    console.log(`⚠️ ${inst} -> no audio streams`);
                }
            } else {
                console.log(`❌ ${inst} -> ${res.status}`);
            }
        } catch (e) {
            console.log(`❌ ${inst} -> ${e.message}`);
        }
    }
}
test();

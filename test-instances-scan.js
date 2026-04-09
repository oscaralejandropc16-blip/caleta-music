async function test() {
    const instances = [
        "https://inv.thepixora.com",
        "https://vid.puffyan.us",
        "https://invidious.snopyta.org",
        "https://yewtu.be",
        "https://invidious.fdn.fr",
        "https://invidious.kavin.rocks",
        "https://inv.bp.projectsegfau.lt",
        "https://inv.vern.cc",
        "https://invidious.tiekoetter.com",
        "https://invidious.privacydev.net",
    ];

    // Also try fetching dynamic list
    try {
        const lr = await fetch("https://api.invidious.io/instances.json", { signal: AbortSignal.timeout(5000) });
        if (lr.ok) {
            const list = await lr.json();
            const dynamic = list.filter(i => i[1] && i[1].type === "https" && i[1].api).map(i => i[1].uri);
            console.log(`Got ${dynamic.length} instances from registry`);
            instances.push(...dynamic);
        }
    } catch (e) { console.log("Registry failed:", e.message); }

    // Deduplicate
    const unique = [...new Set(instances)];
    console.log(`Testing ${unique.length} instances...\n`);

    for (const inst of unique) {
        try {
            const start = Date.now();
            const res = await fetch(`${inst}/api/v1/videos/kJQP7kiw5Fk`, {
                signal: AbortSignal.timeout(5000)
            });
            if (!res.ok) { console.log(`❌ ${inst} -> API ${res.status} (${Date.now() - start}ms)`); continue; }

            const data = await res.json();
            const audio = (data.adaptiveFormats || []).filter(f => f.type?.startsWith("audio/") && f.url);
            if (audio.length === 0) { console.log(`⚠️ ${inst} -> no audio (${Date.now() - start}ms)`); continue; }

            const best = audio.sort((a, b) => (parseInt(b.bitrate) || 0) - (parseInt(a.bitrate) || 0))[0];

            // Test local stream
            const localUrl = `${inst}/latest_version?id=kJQP7kiw5Fk&itag=${best.itag}&local=true`;
            const sr = await fetch(localUrl, {
                headers: { Range: "bytes=0-1000" },
                signal: AbortSignal.timeout(8000)
            });

            if (sr.ok || sr.status === 206) {
                const buf = await sr.arrayBuffer();
                console.log(`✅ ${inst} -> ${sr.status} ${sr.headers.get("content-type")} ${buf.byteLength}bytes (${Date.now() - start}ms)`);
            } else {
                console.log(`⚠️ ${inst} -> stream ${sr.status} (${Date.now() - start}ms)`);
            }
        } catch (e) {
            console.log(`❌ ${inst} -> ${e.message}`);
        }
    }
}
test();

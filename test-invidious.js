async function run() {
    try {
        console.log("Fetching invidious instances...");
        const res = await fetch("https://api.invidious.io/instances.json");
        const list = await res.json();

        const testUrls = list.map(i => i[1].uri);
        console.log(`Testing ${testUrls.length} invidious instances...`);
        let working = [];

        for (let i = 0; i < Math.min(30, testUrls.length); i++) {
            const url = testUrls[i];
            try {
                const start = Date.now();
                const vRes = await fetch(`${url}/api/v1/videos/kJQP7kiw5Fk`, { signal: AbortSignal.timeout(3000) });
                if (vRes.ok) {
                    const data = await vRes.json();
                    if (data.adaptiveFormats && data.adaptiveFormats.length > 0) {
                        console.log(`✅ WORKED: ${url} (${Date.now() - start}ms)`);
                        working.push(url);
                    }
                }
            } catch (e) { }
        }
        console.log("Working Invidious instances:", working);
    } catch (e) {
        console.error(e);
    }
}
run();

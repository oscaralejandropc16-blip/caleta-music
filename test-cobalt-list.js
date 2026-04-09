async function run() {
    const urls = [
        "https://co.wuk.sh/api/json",
        "https://api.cobalt.tools",
        "https://api.cobalt.buss.lol",
        "https://cobalt-api.kwiatektv.me",
        "https://cobalt.qewertyy.dev"
    ];
    for (let url of urls) {
        try {
            const endpoint = url.endsWith('/json') ? url : url.endsWith('/api') ? `${url}/json` : `${url}/api/json`;
            const r = await fetch(endpoint, {
                method: "POST",
                headers: { "Accept": "application/json", "Content-Type": "application/json" },
                body: JSON.stringify({ url: "https://youtube.com/watch?v=kJQP7kiw5Fk", isAudioOnly: true }),
                signal: AbortSignal.timeout(5000)
            });
            if (r.ok) {
                const j = await r.json();
                console.log(`✅ WORKED: ${endpoint} -> ${j.url.substring(0, 50)}`);
            } else {
                console.log(`❌ FAILED: ${endpoint} -> ${r.status}`);
            }
        } catch (e) {
            console.log(`❌ FAILED: ${url} -> ${e.message}`);
        }
    }
}
run();

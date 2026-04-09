async function run() {
    const instances = [
        "https://co.purrdo.be",
        "https://cobalt.101110.xyz",
        "https://api.cobalt.tools",
        "https://api.cobalt.tools",
        "https://cobalt.seasi.dev",
        "https://co.grunn.io",
        "https://cobalt.siesco.dev",
        "https://cobalt.canine.sc",
        "https://cobalt.kwiatektv.me",
    ];
    let working = [];
    for (let url of instances) {
        try {
            console.log(`Checking ${url}...`);
            const res = await fetch(url.includes('api') ? url : `${url}/api/json`, {
                method: "POST",
                headers: { "Accept": "application/json", "Content-Type": "application/json" },
                body: JSON.stringify({ url: "https://www.youtube.com/watch?v=kJQP7kiw5Fk", isAudioOnly: true }),
                signal: AbortSignal.timeout(5000)
            });
            if (res.ok) {
                const data = await res.json();
                if (data.url) {
                    console.log(`✅ WORKED: ${url} -> ${data.url.substring(0, 50)}`);
                    working.push(url);
                }
            } else {
                const err = await res.text();
                // console.log(`❌ Failed ${url}: ${res.status} ${err}`);
            }
        } catch (e) { /* ignore */ }
    }
    console.log("Working:", working);
}
run();

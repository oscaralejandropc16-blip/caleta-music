async function run() {
    try {
        console.log("Fetching piped instances...");
        const res = await fetch("https://raw.githubusercontent.com/TeamPiped/Piped-Instances/main/instances.json");
        const instances = await res.json();

        const testUrls = instances
            .filter(i => i.api_url && i.up_to_date)
            .map(i => i.api_url);

        console.log(`Testing ${testUrls.length} instances...`);
        let working = [];

        for (let i = 0; i < Math.min(20, testUrls.length); i++) {
            const url = testUrls[i];
            try {
                const res = await fetch(`${url}/streams/kJQP7kiw5Fk`, { signal: AbortSignal.timeout(3000) });
                if (res.ok) {
                    const data = await res.json();
                    if (data.audioStreams && data.audioStreams.length > 0) {
                        console.log(`✅ WORKED: ${url}`);
                        working.push(url);
                    }
                }
            } catch (e) { }
        }
        console.log("Working:", working);
    } catch (e) {
        console.error(e);
    }
}
run();

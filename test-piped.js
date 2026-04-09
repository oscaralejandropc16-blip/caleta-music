async function run() {
    const urls = [
        "https://pipedapi.kavin.rocks",
        "https://pipedapi.111111.online",
        "https://de.api.piped.yt",
    ];
    for (let u of urls) {
        try {
            console.log("Trying", u);
            const res = await fetch(`${u}/streams/kJQP7kiw5Fk`, { signal: AbortSignal.timeout(5000) });
            console.log(u, res.status);
            const json = await res.json();
            if (json.audioStreams?.length > 0) {
                console.log("Success with", u, json.audioStreams[0].url.substring(0, 50));
                return;
            }
        } catch (e) {
            console.log(u, "Failed", e.message);
        }
    }
}
run();

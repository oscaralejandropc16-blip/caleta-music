async function run() {
    try {
        console.log("Fetching Piped Stream info...");
        const res = await fetch("https://pipedapi.kavin.rocks/streams/kJQP7kiw5Fk");
        const data = await res.json();
        const urls = data.audioStreams;
        if (urls && urls.length > 0) {
            const trackUrl = urls[0].url;
            console.log("Piped proxy url:", trackUrl.substring(0, 80));
            console.log("Testing CORS...");
            const corsRes = await fetch(trackUrl, { method: "HEAD" });
            console.log("Status:", corsRes.status);
            console.log("CORS Header:", corsRes.headers.get("access-control-allow-origin"));
        } else {
            console.log("No audioStreams");
        }
    } catch (e) {
        console.log("Error:", e.message);
    }
}
run();

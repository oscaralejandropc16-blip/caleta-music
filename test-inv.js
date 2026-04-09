// Invidious instances
async function run() {
    const instances = [
        "https://vid.puffyan.us",
        "https://yewtu.be",
        "https://invidious.nerdvpn.de"
    ];
    for (let u of instances) {
        try {
            console.log("Trying", u);
            const res = await fetch(`${u}/api/v1/videos/kJQP7kiw5Fk`);
            console.log(u, res.status);
            const json = await res.json();
            if (json.formatStreams?.length > 0) {
                const best = json.formatStreams.find(s => s.type?.includes("audio"));
                if (best) console.log("Success Invidious", u, best.url.substring(0, 50));
            }
        } catch (e) {
            console.log(u, "Failed");
        }
    }
}
run();

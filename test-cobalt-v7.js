async function run() {
    console.log("Testing cobalt api.cobalt.tools...");
    try {
        const res = await fetch("https://api.cobalt.tools/api/json", {
            method: "POST",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                url: "https://www.youtube.com/watch?v=kJQP7kiw5Fk", // Despacito
                isAudioOnly: true,
                aFormat: "mp3",
                filenamePattern: "pretty"
            })
        });

        console.log("Cobalt status:", res.status);
        const data = await res.json();
        console.log("Cobalt res:", JSON.stringify(data, null, 2));
    } catch (e) {
        console.log(e);
    }
}
run();

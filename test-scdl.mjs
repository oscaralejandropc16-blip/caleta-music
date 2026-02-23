import scdl from 'soundcloud-downloader';

async function test() {
    try {
        const query = "Maluma Felices los 4";
        console.log("Buscando en SoundCloud:", query);
        // The scdl.search fails via API if no client_id is present sometimes. Let's see if it works without API keys.
        const results = await scdl.search({
            query: query,
            resourceType: 'tracks'
        });

        if (results.collection && results.collection.length > 0) {
            const track = results.collection[0];
            console.log("Encontrado track:", track.permalink_url);

            const stream = await scdl.download(track.permalink_url);
            console.log("Got stream:", stream !== null);
        } else {
            console.log("Not found.");
        }
    } catch (e) {
        console.error("error:", e);
    }
}
test();

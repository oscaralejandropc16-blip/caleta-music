import { Innertube, UniversalCache } from 'youtubei.js';

async function test() {
    const yt = await Innertube.create({
        cache: new UniversalCache(false),
        generate_session_locally: true
    });
    const id = "hM5lO2PWnGk"; // Maluma

    try {
        const info = await yt.getBasicInfo(id, 'IOS');
        console.log("Got info:", info.basic_info.title);

        console.log("Downloading with IOS client spoof...");
        const stream = await yt.download(id, {
            type: 'audio',
            quality: 'best',
            client: 'IOS'
        });

        const reader = stream.getReader();
        const result = await reader.read();
        console.log("Got chunks?", !!result.value);
        if (result.value) {
            console.log("Chunk size:", result.value.byteLength);
        }
    } catch (e) {
        console.error("Error:", e);
    }
}
test();

import { Innertube, UniversalCache } from 'youtubei.js';

async function test() {
    const yt = await Innertube.create({ cache: new UniversalCache(false) });
    const id = "hM5lO2PWnGk"; // Maluma

    try {
        const stream = await yt.download(id, {
            type: 'audio',
            quality: 'best'
        });

        const reader = stream.getReader();
        const result = await reader.read();
        console.log("Got chunks?", !!result.value);
    } catch (e) {
        console.error(e);
    }
}
test();

import { yt } from 'youtube-ext';

async function test() {
    try {
        const stream = await yt.stream('hM5lO2PWnGk');
        console.log("Stream fetched! size:", stream.length);
    } catch (e) {
        console.log("error", e.message);
    }
}
test();

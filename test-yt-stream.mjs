import ytStream from 'yt-stream';

async function test() {
    try {
        const url = "https://www.youtube.com/watch?v=hM5lO2PWnGk";
        const stream = await ytStream.stream(url, {
            quality: 'high',
            type: 'audio',
        });
        console.log('Stream URL:', stream.url);
    } catch (e) {
        console.error("error:", e);
    }
}
test();

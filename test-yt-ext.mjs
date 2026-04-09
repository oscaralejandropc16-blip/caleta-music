import yt from 'youtube-ext';

async function test() {
    try {
        const info = await yt.videoInfo('https://www.youtube.com/watch?v=hM5lO2PWnGk');
        console.log("Got info");
        const formats = await yt.getFormats(info);
        console.log("Formats:", formats);
    } catch (e) {
        console.log("error", e.message);
    }
}
test();

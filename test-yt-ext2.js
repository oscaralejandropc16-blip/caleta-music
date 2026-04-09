const { yt } = require('youtube-ext');

async function run() {
    try {
        const info = await yt.videoInfo('https://www.youtube.com/watch?v=kJQP7kiw5Fk');
        console.log(info.title, info.channel.name);
    } catch (e) {
        console.error(e.message);
    }
}
run();

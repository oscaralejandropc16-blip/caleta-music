const play = require('play-dl');

async function test() {
    try {
        console.log("Fetching stream...");
        let stream = await play.stream("https://www.youtube.com/watch?v=kJQP7kiw5Fk");
        console.log("Success! Stream URL:", stream.url.substring(0, 50));
    } catch (e) {
        console.log("Error:", e.message);
    }
}
test();

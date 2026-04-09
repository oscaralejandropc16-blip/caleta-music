const spotifyUrlInfo = require('spotify-url-info')(fetch);

async function run() {
    try {
        const data = await spotifyUrlInfo.getTracks('https://open.spotify.com/playlist/37i9dQZF1DWZeKCadgRdKQ');
        console.log(JSON.stringify(data[0], null, 2));
    } catch (e) {
        console.error(e);
    }
}
run();

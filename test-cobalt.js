async function test() {
    const url = 'https://api.cobalt.tools/api/json';
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0'
            },
            body: JSON.stringify({
                url: 'https://www.youtube.com/watch?v=2bHrbhIG2Y4',
                isAudioOnly: true,
                aFormat: "mp3"
            })
        });
        const data = await res.json();
        console.log(data);
    } catch (e) {
        console.error(e);
    }
}
test();

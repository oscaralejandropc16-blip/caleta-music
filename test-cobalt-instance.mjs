async function test() {
    const url = "https://www.youtube.com/watch?v=hM5lO2PWnGk";
    try {
        const res = await fetch("https://co.wuk.sh/", {
            method: "POST",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ url: url, isAudioOnly: true, aFormat: "mp3" })
        });
        console.log(res.status);
        console.log(await res.text());
    } catch (e) {
        console.error(e);
    }
}
test();

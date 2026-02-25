import fs from 'fs';
import {
    initDeezerApi,
    getTrackInfo,
    getTrackDownloadUrl,
    decryptDownload
} from 'd-fi-core';

async function run() {
    try {
        console.log("Initializing Deezer API...");
        const arl = "ee974bbd9ccb632b067cb6e2406a60cd9f0bd782d7f62f2a3d8448a63010c92658cb84d0f46721294621af6c326cdce2cd7260c324fcc97604ef79dd9a96de88eff778d36668bd61d77a0d8de9beca82a93c7c1f8a676c67100838e612aa46cd";
        await initDeezerApi(arl);

        console.log("Fetching track info...");
        const trackId = "3135556"; // Harder, Better, Faster, Stronger
        const track = await getTrackInfo(trackId);
        console.log("Track:", track.SNG_TITLE, "by", track.ART_NAME);

        // 9=320kbps, 3=128kbps, 1=FLAC. Fallback if not available
        console.log("Fetching download URL...");
        const trackUrlRes = await getTrackDownloadUrl(track, 3);
        console.log("Download URL:", trackUrlRes.trackUrl);

        console.log("Downloading audio file...");
        const response = await fetch(trackUrlRes.trackUrl);
        const arrayBuffer = await response.arrayBuffer();
        const encryptedBuffer = Buffer.from(arrayBuffer);

        console.log("Decrypting...");
        const buffer = decryptDownload(encryptedBuffer, track.SNG_ID);

        fs.writeFileSync('test-track.mp3', buffer);
        console.log(`Saved as test-track.mp3! (Size: ${buffer.length} bytes)`);

    } catch (e) {
        console.error(e);
    }
}
run();

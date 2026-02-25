import fs from 'fs';
import { initDeezerApi, getTrackInfo, getTrackDownloadUrl } from 'd-fi-core';
import crypto from 'crypto';

const md5 = (data) => crypto.createHash('md5').update(data).digest('hex');

const getBlowfishKey = (trackId) => {
    const SECRET = 'g4el58wc' + '0zvf9na1';
    const idMd5 = md5(trackId);
    let bfKey = '';
    for (let i = 0; i < 16; i++) {
        bfKey += String.fromCharCode(idMd5.charCodeAt(i) ^ idMd5.charCodeAt(i + 16) ^ SECRET.charCodeAt(i));
    }
    return bfKey;
};

const decryptChunk = (chunk, blowFishKey) => {
    const cipher = crypto.createDecipheriv('bf-cbc', blowFishKey, Buffer.from([0, 1, 2, 3, 4, 5, 6, 7]));
    cipher.setAutoPadding(false);
    return Buffer.concat([cipher.update(chunk), cipher.final()]);
};

async function run() {
    try {
        console.log("Initializing Deezer API...");
        const arl = "ee974bbd9ccb632b067cb6e2406a60cd9f0bd782d7f62f2a3d8448a63010c92658cb84d0f46721294621af6c326cdce2cd7260c324fcc97604ef79dd9a96de88eff778d36668bd61d77a0d8de9beca82a93c7c1f8a676c67100838e612aa46cd";
        await initDeezerApi(arl);

        console.log("Fetching track info...");
        const trackId = "3135556"; // Harder, Better, Faster, Stronger
        const track = await getTrackInfo(trackId);

        console.log("Fetching download URL...");
        const trackUrlRes = await getTrackDownloadUrl(track, 3);

        console.log("Streaming response...");
        const response = await fetch(trackUrlRes.trackUrl);
        const reader = response.body.getReader();

        const blowFishKey = getBlowfishKey(track.SNG_ID);
        let i = 0;
        let buffer = Buffer.alloc(0);

        const outStream = fs.createWriteStream('test-streamed.mp3');

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                if (buffer.length > 0) {
                    outStream.write(buffer);
                }
                outStream.end();
                break;
            }

            buffer = Buffer.concat([buffer, Buffer.from(value)]);

            while (buffer.length >= 2048) {
                const chunkToProcess = buffer.subarray(0, 2048);
                buffer = buffer.subarray(2048);

                if (i % 3 === 0) {
                    outStream.write(decryptChunk(chunkToProcess, blowFishKey));
                } else {
                    outStream.write(chunkToProcess);
                }
                i++;
            }
        }

        console.log("Streaming done! Saved as test-streamed.mp3");

    } catch (e) {
        console.error(e);
    }
}
run();

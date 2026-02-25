import { searchMusic } from 'd-fi-core';

async function run() {
    const results = await searchMusic("Oasis Wonderwall");
    // results is usually an object like { tracks: { data: [...] }, ... }
    // Let's log it
    console.log(JSON.stringify(results.TRACK.data[0], null, 2));
}
run();

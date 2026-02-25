const { Blowfish } = require("egoroof-blowfish");
const fs = require("fs");

const start = Date.now();
const blowFishKey = "g4el58wc0zvf9na1";

for (let i = 0; i < 1333; i++) {
    const bf = new Blowfish(blowFishKey, Blowfish.MODE.CBC, Blowfish.PADDING.NULL);
    bf.setIv(Buffer.from([0, 1, 2, 3, 4, 5, 6, 7]));
    const decrypted = bf.decode(Buffer.alloc(2048), Blowfish.TYPE.UINT8_ARRAY);
}
console.log("Time:", Date.now() - start);

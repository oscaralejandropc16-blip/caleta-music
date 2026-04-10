/**
 * Script para generar el TELEGRAM_SESSION string.
 * Ejecutar UNA sola vez: node scripts/gen-telegram-session.mjs
 */
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import * as readline from "readline";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (q) => new Promise((r) => rl.question(q, r));

console.log("\n🔐 Generador de sesión de Telegram para Caleta Music\n");

const apiId = parseInt(await question("API ID (de my.telegram.org): "));
const apiHash = await question("API Hash (de my.telegram.org): ");
const phone = await question("Tu número de teléfono (ej: +584141234567): ");

const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
  connectionRetries: 5,
});

await client.start({
  phoneNumber: phone,
  phoneCode: async () => await question("Código que llegó a tu Telegram: "),
  password: async () => await question("Contraseña 2FA (Enter si no tienes): "),
  onError: (err) => console.error("Error:", err),
});

const sessionStr = client.session.save();

console.log("\n✅ ¡Sesión generada! Copia estas líneas a tu .env.local:\n");
console.log(`TELEGRAM_API_ID=${apiId}`);
console.log(`TELEGRAM_API_HASH=${apiHash}`);
console.log(`TELEGRAM_SESSION=${sessionStr}`);
console.log("\n");

rl.close();
await client.disconnect();
process.exit(0);

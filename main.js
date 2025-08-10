// jangan di ubah
'use strict';

const fs = require('fs');
const path = require('path');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const os = require('os');
const prettyMs = require('pretty-ms');
const readline = require('readline');

const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  DisconnectReason
} = require('@adiwajshing/baileys');

const { BOT_NAME, PREFIX, OWNER_NUMBER, SESSION_FOLDER, PAIRING_PROMPT } = require('./settings');
const { DB, saveDB } = require('./data');

if (!fs.existsSync(SESSION_FOLDER)) fs.mkdirSync(SESSION_FOLDER, { recursive: true });

/** load commands automatically from ./commands.
 * each command must export { name, usage, description, execute }
 */
function loadCommands() {
  const commands = new Map();
  const dir = path.join(__dirname, 'commands');
  if (!fs.existsSync(dir)) return commands;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
  for (const file of files) {
    try {
      const cmd = require(path.join(dir, file));
      if (cmd && cmd.name && typeof cmd.execute === 'function') {
        commands.set(cmd.name.toLowerCase(), cmd);
      } else {
        console.warn(`Command ${file} invalid (missing name/execute)`);
      }
    } catch (e) {
      console.error('Gagal load command', file, e?.message || e);
    }
  }
  return commands;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B','KB','MB','GB','TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function statsSnapshot() {
  return {
    memory: formatBytes(process.memoryUsage().heapUsed) + ' / ' + formatBytes(process.memoryUsage().heapTotal),
    uptime: prettyMs(Date.now() - DB.stats.startTime, { compact: true }),
    commands: DB.stats.commands,
    messages: DB.stats.messages,
    node: process.version,
    platform: os.platform() + ' ' + os.arch()
  };
}

async function askConsole(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(res => rl.question(question, ans => { rl.close(); res(ans); }));
}

async function startBot() {
  console.log(`Starting ${BOT_NAME}...`);
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_FOLDER);

  let waVersion = undefined;
  try {
    const v = await fetchLatestBaileysVersion();
    waVersion = v.version;
    // console.log('Using WA version:', waVersion);
  } catch (_) {
    // ignore, use default
  }

  const sock = makeWASocket({
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    auth: makeCacheableSignalKeyStore(state, { logger: pino() }),
    version: waVersion
  });

  // Save credentials on update
  sock.ev.on('creds.update', saveCreds);

  // pairing-code attempt (best-effort). if not supported or fails -> fallback QR
  try {
    if (PAIRING_PROMPT && !state?.creds?.registered) {
      const want = (await askConsole('Gunakan pairing-code login? (y/N): ')).trim().toLowerCase();
      if (want === 'y') {
        const number = (await askConsole('Masukkan nomor WhatsApp (contoh 6281234567890): ')).trim();
        console.log('Requesting pairing code...');
        try {
          // requestPairingCode may exist on sock; use best-effort
          if (typeof sock.requestPairingCode === 'function') {
            const code = await sock.requestPairingCode(number);
            console.log('Pairing code (kirim ke nomor yang tercantum di WhatsApp):', code);
            console.log('Silakan buka WhatsApp -> Settings -> Linked Devices -> Link a device -> Use code.');
          } else {
            console.log('Pairing-code tidak tersedia pada versi Baileys ini. Akan menampilkan QR sebagai gantinya.');
            // set printQRInTerminal true by emitting connection update? we'll show QR from connection.update
          }
        } catch (err) {
          console.warn('Pairing-code gagal, fallback ke QR. Error:', err?.message || err);
        }
      }
    }
  } catch (e) {
    console.warn('Pairing-step skipped:', e?.message || e);
  }

  const commands = loadCommands();

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      // show QR fallback
      console.log('QR code (fallback). Scan with WhatsApp to link device:');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'open') {
      console.log('✅ Connected as', sock.user?.name || sock.user?.id);
    }

    if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.statusCode;
      console.warn('Connection closed:', reason || lastDisconnect?.error?.message || lastDisconnect);
      if (reason === DisconnectReason.loggedOut) {
        console.log('Logged out. Removing session and exit.');
        try { fs.rmSync(SESSION_FOLDER, { recursive: true, force: true }); } catch (e) {}
        process.exit(0);
      } else {
        // try reconnect
        setTimeout(() => startBot(), 2000);
      }
    }
  });

  // message handler
  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const message of messages) {
      try {
        if (!message.message) continue;
        if (message.key.remoteJid === 'status@broadcast') continue;
        if (message.key.fromMe) continue;

        DB.stats.messages += 1;

        // extract text from supported message types
        let body = '';
        const mType = Object.keys(message.message)[0];
        if (mType === 'conversation') body = message.message.conversation;
        else if (mType === 'extendedTextMessage') body = message.message.extendedTextMessage?.text || '';
        else if (mType === 'imageMessage') body = message.message.imageMessage?.caption || '';
        else if (mType === 'documentMessage') body = message.message.documentMessage?.fileName || '';

        if (!body) continue;
        if (!body.startsWith(PREFIX)) continue;

        const start = Date.now();
        const [rawCmd, ...args] = body.slice(PREFIX.length).trim().split(/\s+/);
        const cmd = rawCmd.toLowerCase();

        DB.stats.commands += 1;
        saveDB();

        const command = commands.get(cmd);
        if (!command) {
          await sock.sendMessage(message.key.remoteJid, { text: `Perintah *${cmd}* tidak dikenal. Ketik ${PREFIX}menu` }, { quoted: message });
          continue;
        }

        try {
          await command.execute({ sock, message, args, statsSnapshot, elapsed: Date.now() - start });
        } catch (err) {
          console.error('Error saat menjalankan command', cmd, err?.message || err);
          await sock.sendMessage(message.key.remoteJid, { text: 'Terjadi error saat menjalankan perintah.' }, { quoted: message });
        }
      } catch (e) {
        console.error('messages.upsert handler error', e?.message || e);
      }
    }
  });

  // graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\\nShutting down...');
    try { await sock.logout(); } catch(_) {}
    process.exit(0);
  });
}

module.exports = { startBot };

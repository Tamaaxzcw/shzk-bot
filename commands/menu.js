const fs = require('fs');
const path = require('path');
const { BOT_NAME, PREFIX, OWNER_NUMBER } = require('../settings');

module.exports = {
  name: 'menu',
  usage: 'menu',
  description: 'Tampilkan daftar perintah',
  execute: async ({ sock, message }) => {
    const dir = path.join(__dirname);
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.js')) : [];
    let txt = `*${BOT_NAME} — MENU*\n\nDaftar perintah:\n`;
    for (const file of files) {
      try {
        const cmd = require(path.join(dir, file));
        txt += `• ${PREFIX}${cmd.usage} — ${cmd.description}\n`;
      } catch (e) {
        // skip
      }
    }
    txt += `\nOwner: ${OWNER_NUMBER.replace('@s.whatsapp.net','')}`;
    await sock.sendMessage(message.key.remoteJid, { text: txt }, { quoted: message });
  }
};

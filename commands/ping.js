module.exports = {
  name: 'ping',
  usage: 'ping',
  description: 'Menampilkan ping dan stats bot',
  execute: async ({ sock, message, statsSnapshot, elapsed }) => {
    const snap = statsSnapshot();
    const txt = `*PONG!*
Speed: ${elapsed} ms
Uptime: ${snap.uptime}
Memory: ${snap.memory}
Commands used: ${snap.commands}
Messages handled: ${snap.messages}
Node: ${snap.node}
Platform: ${snap.platform}`;

    await sock.sendMessage(message.key.remoteJid, { text: txt }, { quoted: message });
  }
};

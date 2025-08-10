module.exports = {
  name: 'echo',
  usage: 'echo <teks>',
  description: 'Mengulang teks yang dikirim',
  execute: async ({ sock, message, args }) => {
    const text = args.join(' ');
    if (!text) return await sock.sendMessage(message.key.remoteJid, { text: 'Penggunaan: .echo <teks>' }, { quoted: message });
    await sock.sendMessage(message.key.remoteJid, { text }, { quoted: message });
  }
};

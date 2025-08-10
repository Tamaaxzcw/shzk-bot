// jgn di ubah
const { startBot } = require('./main');

startBot().catch(err => {
  console.error('❌ Gagal menjalankan bot:', err);
  process.exit(1);
});

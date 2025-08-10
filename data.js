// jgn di ubah ubah
const fs = require('fs');
const path = require('path');
const { SESSION_FOLDER } = require('./settings');

if (!fs.existsSync(SESSION_FOLDER)) fs.mkdirSync(SESSION_FOLDER, { recursive: true });

const DB_FILE = path.join(SESSION_FOLDER, 'db.json');

let DB = {
  users: {},
  stats: { commands: 0, messages: 0, startTime: Date.now() }
};

try {
  if (fs.existsSync(DB_FILE)) {
    DB = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  }
} catch (e) {
  console.warn('Gagal memuat DB, menggunakan default.', e?.message || '');
}

function saveDB() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(DB, null, 2));
  } catch (e) {
    console.error('Gagal menyimpan DB:', e?.message || e);
  }
}

module.exports = { DB, saveDB };

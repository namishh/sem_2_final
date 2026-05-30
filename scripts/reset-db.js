const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'db', 'data.db');

function removeFile(file) {
  try {
    fs.unlinkSync(file);
    console.log(`Removed ${file}`);
  } catch (err) {
    if (err.code === 'ENOENT') return;
    if (err.code === 'EBUSY' || err.code === 'EPERM') {
      console.error(`Could not remove ${file}. Stop the server (npm start) and try again.`);
      process.exit(1);
    }
    throw err;
  }
}

for (const file of [DB_PATH, `${DB_PATH}-wal`, `${DB_PATH}-shm`]) {
  removeFile(file);
}

require('../db/database');
console.log(`Database reset at ${DB_PATH}`);

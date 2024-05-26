const sqlite3 = require('sqlite3').verbose();
const { initAuthCreds, proto, BufferJSON } = require('@adiwajshing/baileys');

module.exports = async function (sesi) {
  const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) {
      console.error('Error connecting to the SQLite database:', err);
      throw err;
    }
  });

  // Buat tabel jika belum ada, dan pastikan operasi lainnya menunggu sampai tabel dibuat
  await new Promise((resolve, reject) => {
    db.run(`CREATE TABLE IF NOT EXISTS sessions (
      id TEXT,
      session TEXT,
      value TEXT,
      PRIMARY KEY (id, session)
    )`, (err) => {
      if (err) {
        return reject(err);
      }
      resolve();
    });
  });

  const readData = async (id) => {
    return new Promise((resolve, reject) => {
      db.get('SELECT value FROM sessions WHERE id = ? AND session = ?', [id, sesi], (err, row) => {
        if (err) {
          return reject(err);
        }
        if (!row || !row.value) {
          return resolve(null);
        }
        const credsParsed = JSON.parse(row.value, BufferJSON.reviver);
        resolve(credsParsed);
      });
    });
  };

  const writeData = async (id, value) => {
    const valueFixed = JSON.stringify(value);
    return new Promise((resolve, reject) => {
      db.run('REPLACE INTO sessions (id, session, value) VALUES (?, ?, ?)', [id, sesi, valueFixed], function (err) {
        if (err) {
          return reject(err);
        }
        resolve();
      });
    });
  };

  const removeData = async (id) => {
    return new Promise((resolve, reject) => {
      db.run('DELETE FROM sessions WHERE id = ? AND session = ?', [id, sesi], function (err) {
        if (err) {
          return reject(err);
        }
        resolve();
      });
    });
  };

  const removeAll = async () => {
    return new Promise((resolve, reject) => {
      db.run('DELETE FROM sessions WHERE session = ?', [sesi], function (err) {
        if (err) {
          return reject(err);
        }
        resolve();
      });
    });
  };

  const creds = await readData('creds') || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          await Promise.all(ids.map(async (id) => {
            let value = await readData(`${type}-${id}`);
            if (type === 'app-state-sync-key' && value) {
              value = proto.Message.AppStateSyncKeyData.fromObject(value);
            }
            data[id] = value;
          }));
          return data;
        },
        set: async (data) => {
          const tasks = [];
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const name = `${category}-${id}`;
              tasks.push(value ? writeData(name, value) : removeData(name));
            }
          }
          await Promise.all(tasks);
        }
      }
    },
    saveCreds: async () => {
      await writeData('creds', creds);
    },
    removeCreds: async () => {
      await removeAll();
    }
  };
};

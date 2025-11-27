// utils/valueMonitor.js
const fs = require('fs');
const path = require('path');
const { getCryptoPrice } = require('./cryptoUtils'); // usa tu helper existente

const DB_PATH = path.join(__dirname, '..', 'database', 'value.json');

function ensureDb() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify({}, null, 2), 'utf8');
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}
function saveDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = function startValueMonitor(client) {
  // intervalo de comprobación general (cada 60s)
  const CHECK_MS = 60 * 1000;

  setInterval(async () => {
    const db = ensureDb();
    const nowSec = Math.floor(Date.now() / 1000);

    for (const guildId of Object.keys(db)) {
      const guildCfg = db[guildId];
      if (!guildCfg || !guildCfg.periodic) continue;

      // Para cada moneda periódica
      for (const coinId of Object.keys(guildCfg.periodic)) {
        const cfg = guildCfg.periodic[coinId];
        if (!cfg || !cfg.interval || !cfg.channel) continue;

        const last = cfg.lastSent ? Number(cfg.lastSent) : 0;
        const intervalSec = Number(cfg.interval) * 60;
        if (nowSec - last < intervalSec) continue; // no toca aún

        try {
          // obtener precio (usa tu helper)
          const priceObj = await getCryptoPrice(coinId);
          // getCryptoPrice debe devolver { price, change24h, lastUpdatedAt } - si tu helper difiere, adáptalo
          const price = priceObj?.price ?? null;
          if (!price) continue;

          const guild = client.guilds.cache.get(guildId);
          if (!guild) continue;
          const channel = guild.channels.cache.get(cfg.channel);
          if (!channel) continue;

          // construir embed simple (puedes mejorar formato igual que comando crypto)
          const embed = {
            color: 0x6A0DAD,
            title: `${coinId.toUpperCase()} — $${Number(price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`,
            fields: [
              { name: 'Fuente', value: 'CoinGecko', inline: true }
            ],
            timestamp: new Date()
          };

          await channel.send({ embeds: [embed] });

          // actualizar lastSent y persistir
          db[guildId].periodic[coinId].lastSent = nowSec;
          saveDb(db);

          // pequeña pausa para evitar rate limits si hay muchas monedas
          await sleep(350);
        } catch (err) {
          console.error('Error en valueMonitor para', guildId, coinId, err);
        }
      }
    }
  }, CHECK_MS);
};
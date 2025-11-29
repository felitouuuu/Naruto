// utils/valueMonitor.js
const { EmbedBuilder } = require('discord.js');
const { getCryptoPrice } = require('./cryptoUtils');
const db = require('../dbhelper');
const pool = require('../database'); // 🔥 necesario para actualizar last_sent

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

module.exports = function startValueMonitor(client) {
  const CHECK_MS = 60 * 1000; // cada 60s

  setInterval(async () => {
    try {
      const guilds = client.guilds.cache.map(g => g.id);

      for (const guildId of guilds) {
        const rows = await db.listPeriodic(guildId);
        if (!rows || !rows.length) continue;

        for (const cfg of rows) {
          if (!cfg.enabled) continue;

          const coin = cfg.coin;
          const intervalMin = Number(cfg.interval_minutes);
          const channelId = cfg.channel_id;
          const lastSent = Number(cfg.last_sent_epoch || 0);

          const nowSec = Math.floor(Date.now() / 1000);
          const intervalSec = intervalMin * 60;

          if (nowSec - lastSent < intervalSec) continue;

          try {
            const priceObj = await getCryptoPrice(coin);
            if (!priceObj || !priceObj.price) continue;

            const guild = client.guilds.cache.get(guildId);
            if (!guild) continue;

            const channel = guild.channels.cache.get(channelId);
            if (!channel) continue;

            const price = Number(priceObj.price).toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            });

            const embed = new EmbedBuilder()
              .setColor('#6A0DAD')
              .setTitle(`💰 ${coin.toUpperCase()} — $${price} USD`)
              .addFields(
                { name: '⏱ Actualizado', value: `<t:${Math.floor(Date.now()/1000)}:R>`, inline: true },
                { name: '📊 Fuente', value: 'CoinGecko', inline: true }
              )
              .setTimestamp();

            await channel.send({ embeds: [embed] });

            // 🔥 actualización correcta en PostgreSQL (Neon)
            await pool.query(
              `UPDATE value_periodic
               SET last_sent = NOW()
               WHERE guild_id = $1 AND coin = $2`,
              [guildId, coin]
            );

            await sleep(350);
          } catch (err) {
            console.error(`Error enviando alerta de ${coin} en ${guildId}:`, err);
          }
        }
      }
    } catch (err) {
      console.error('ValueMonitor falló:', err);
    }
  }, CHECK_MS);
};
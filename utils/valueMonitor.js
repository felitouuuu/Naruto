// utils/valueMonitor.js
const { EmbedBuilder } = require('discord.js');
const { getCryptoPrice } = require('./cryptoUtils'); // tu helper existente
const dbhelper = require('../dbhelper');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * startValueMonitor(client, opts)
 * - client: instancia de discord.js Client
 * - opts.checkIntervalMs: cada cuanto chequear (por defecto 60s)
 */
module.exports = function startValueMonitor(client, opts = {}) {
  const CHECK_MS = typeof opts.checkIntervalMs === 'number' ? opts.checkIntervalMs : 60 * 1000;
  const SEND_PAUSE_MS = typeof opts.sendPauseMs === 'number' ? opts.sendPauseMs : 350;

  // función principal que hace un único "tick"
  const runOnce = async () => {
    let periodics = [];
    try {
      // dbhelper.getAllPeriodics() -> debe devolver array de registros:
      // [{ guild_id, coin, interval_min, channel_id, last_sent (seconds) }, ...]
      periodics = await dbhelper.getAllPeriodics();
      if (!Array.isArray(periodics) || periodics.length === 0) return;
    } catch (err) {
      console.error('valueMonitor: error leyendo periodics desde DB', err);
      return;
    }

    const nowSec = Math.floor(Date.now() / 1000);

    // Agrupar por moneda para pedir precio una sola vez por moneda
    const grouped = new Map();
    for (const p of periodics) {
      // Normalizar formas (por si)
      const guildId = String(p.guild_id);
      const coin = String(p.coin).toLowerCase();
      const intervalMin = Number(p.interval_min || p.interval || 0);
      const channelId = String(p.channel_id || p.channel || p.channelid || '');
      const lastSent = Number(p.last_sent || p.lastSent || 0);

      if (!coin || !intervalMin || !channelId) continue;

      if (!grouped.has(coin)) grouped.set(coin, []);
      grouped.get(coin).push({ guildId, coin, intervalMin, channelId, lastSent });
    }

    // Para cada coin: obtener precio y procesar sus registros
    for (const [coin, entries] of grouped.entries()) {
      let priceObj;
      try {
        priceObj = await getCryptoPrice(coin); // debe devolver { price, change24h, lastUpdatedAt }
      } catch (err) {
        console.error(`valueMonitor: error al obtener precio de ${coin}`, err);
        continue;
      }
      if (!priceObj || !priceObj.price) {
        // nada que hacer si no hay precio
        continue;
      }

      // Para cada entry, verificar si corresponde enviar
      for (const e of entries) {
        try {
          const { guildId, channelId, intervalMin, lastSent } = e;
          const intervalSec = Math.max(30 * 60, intervalMin * 60); // si por algún motivo <30m, forzamos 30m
          if (nowSec - lastSent < intervalSec) continue; // todavía no toca

          // obtener guild (fetch para garantizar acceso aún si no estaba en cache)
          let guild;
          try {
            guild = await client.guilds.fetch(guildId);
          } catch {
            // servidor no disponible / bot expulsado
            continue;
          }
          if (!guild) continue;

          // fetch channel (puede fallar si no existe o no tiene permisos)
          let channel;
          try {
            channel = await guild.channels.fetch(channelId);
          } catch {
            channel = null;
          }
          if (!channel || typeof channel.send !== 'function') continue;

          // construir embed con datos
          const priceStr = Number(priceObj.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 });
          const change24 = (priceObj.change24h !== undefined && priceObj.change24h !== null)
            ? `${Number(priceObj.change24h).toFixed(2)}%`
            : 'N/A';
          const updatedAt = priceObj.lastUpdatedAt
            ? new Date(Number(priceObj.lastUpdatedAt) * 1000).toLocaleString('en-US', { timeZone: 'America/New_York' })
            : 'N/A';

          const embed = new EmbedBuilder()
            .setTitle(`${coin.toUpperCase()} — $${priceStr} USD`)
            .setColor('#6A0DAD')
            .addFields(
              { name: 'Cambio 24h', value: String(change24), inline: true },
              { name: 'Intervalo', value: `${intervalMin}m`, inline: true },
              { name: 'Última actualización', value: updatedAt, inline: true },
              { name: 'Fuente', value: 'CoinGecko', inline: true }
            )
            .setTimestamp();

          // intentar enviar (si falla, no abortar)
          try {
            await channel.send({ embeds: [embed] });
          } catch (err) {
            // posible falta de permisos en canal
            console.warn(`valueMonitor: no pude enviar en ${guildId}/${channelId} ->`, err?.message || err);
          }

          // actualizar last_sent en la DB (usar touch/update si existe o fallback)
          try {
            if (typeof dbhelper.touchPeriodic === 'function') {
              await dbhelper.touchPeriodic(guildId, coin, nowSec);
            } else {
              // fallback: leer registro y reescribir con mismo interval/channel y nuevo last_sent
              const cur = await dbhelper.getPeriodic(guildId, coin);
              if (cur) {
                const intervalToSave = Number(cur.interval_min || cur.interval || intervalMin);
                const channelToSave = String(cur.channel_id || cur.channel || channelId);
                // setPeriodic debe aceptar (guildId, coin, intervalMin, channelId, lastSent?) — si no, ajusta tu dbhelper
                if (typeof dbhelper.setPeriodic === 'function') {
                  // intentar pasar lastSent como 5º argumento (dbhelper puede ignorarlo si no lo necesita)
                  await dbhelper.setPeriodic(guildId, coin, intervalToSave, channelToSave, nowSec);
                }
              }
            }
          } catch (err) {
            console.error('valueMonitor: error actualizando last_sent en DB', err);
          }

          // pause corta entre envíos para evitar rate limits si hay muchos
          await sleep(SEND_PAUSE_MS);
        } catch (err) {
          console.error('valueMonitor: error procesando entrada', err);
        }
      } // end each entry
    } // end each coin
  }; // end runOnce

  // iniciar loop (primera ejecución inmediata)
  (async function loop() {
    try {
      await runSafe();
    } catch (err) {
      // never crash the monitor loop
      console.error('valueMonitor loop fatal:', err);
    }
    setInterval(async () => {
      try {
        await runSafe();
      } catch (err) {
        console.error('valueMonitor loop error:', err);
      }
    }, CHECK_MS);
  })();

  // wrapper que llama runOnce y atrapa errores
  async function runSafe() {
    try {
      await runOnce();
    } catch (err) {
      console.error('valueMonitor: runOnce error', err);
    }
  }

  // devolver objeto con posibilidad de stop si se quiere
  return {
    stop: () => {
      // no implementado el stop del interval concreto, pero podrías extraer el timerId si quieres
      console.log('valueMonitor: stop requested (no-op).');
    }
  };
};
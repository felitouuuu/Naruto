// commands/cryptochart.js
const {
  EmbedBuilder,
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder
} = require('discord.js');

const fetch = globalThis.fetch || require('node-fetch');
const { COINS } = require('../utils/cryptoUtils');

const COLORS = { main: '#6A0DAD', error: '#ED4245' };
const QUICKCHART_CREATE = 'https://quickchart.io/chart/create';
const MAX_POINTS = 240;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutos
const COOLDOWN_MS = 10 * 1000; // 10s
const RETRY_429_MS = 1000; // espera inicial al recibir 429
const QUICKCHART_DELAY_MS = 350; // espera entre requests a QuickChart para no saturar

// MENU de rangos que solicitaste (etiquetas: Ultimo dia, 7d, 30d, 4 meses (120d), 1 año, max)
const RANGES = [
  { id: '24h', label: 'Último día', days: 1 },
  { id: '7d', label: 'Últimos 7d', days: 7 },
  { id: '30d', label: 'Últimos 30d', days: 30 },
  { id: '120d', label: 'Últimos 4 meses', days: 120 },
  { id: '365d', label: 'Último año', days: 365 },
  { id: 'max', label: 'Total (Max)', days: 'max' }
];

function money(n) {
  if (n == null) return 'N/A';
  return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function percent(n) {
  if (n == null) return 'N/A';
  return `${Number(n).toFixed(2)}%`;
}
function resolveCoinId(input) {
  if (!input) return null;
  const s = input.toLowerCase();
  return COINS[s] || s;
}

// Caché en memoria: key = symbolLower
// { createdAt, expiresAt, summary, images: { rangeId: url }, lastValues: { rangeId: { first,last,change } }, disableTimeout, messageMap }
// messageMap maps messageId -> { channelId, timeoutId } to later disable components when message ages out
const cache = {};

// cooldown por usuario simple
const userCooldowns = new Map();

// Helpers: sleep and retry for 429
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchWithRetry(url, opts = {}, tries = 3) {
  let attempt = 0;
  let backoff = RETRY_429_MS;
  while (attempt < tries) {
    attempt++;
    const res = await fetch(url, opts);
    if (res.status === 429) {
      // espera exponencial
      await sleep(backoff);
      backoff *= 2;
      attempt++;
      continue;
    }
    return res;
  }
  // final attempt
  return fetch(url, opts);
}

// Crear chart en QuickChart (POST -> retorna URL)
// hacemos requests secuenciales con retraso para no saturar
async function createQuickChartUrl(labels, values, title, color = 'rgba(106,13,173,0.9)') {
  // construir configuración Chart.js
  const cfg = {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: title,
        data: values,
        fill: true,
        borderColor: color,
        backgroundColor: color,
        pointRadius: 0,
        tension: 0.12
      }]
    },
    options: {
      plugins: {
        legend: { display: false },
        title: { display: true, text: title, font: { size: 16 } }
      },
      scales: {
        x: { display: false },
        y: {
          ticks: {
            callback: function (v) { return typeof v === 'number' ? ('$' + Number(v).toLocaleString()) : v; }
          }
        }
      },
      elements: { line: { borderWidth: 2 } }
    }
  };

  const body = { chart: cfg, backgroundColor: 'transparent', width: 1200, height: 420 };
  const res = await fetchWithRetry(QUICKCHART_CREATE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }, 4);

  if (!res.ok) throw new Error(`QuickChart ${res.status}`);
  const j = await res.json();
  return j.url || null;
}

// obtenemos precios desde CoinGecko (soporta days num, max y range 1h)
async function fetchMarketData(coinId, rangeId) {
  try {
    if (rangeId === '1h') {
      const now = Math.floor(Date.now() / 1000);
      const from = now - 3600;
      const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}/market_chart/range?vs_currency=usd&from=${from}&to=${now}`;
      const r = await fetchWithRetry(url, {}, 4);
      if (!r.ok) throw new Error(`CoinGecko ${r.status}`);
      const j = await r.json();
      if (!j.prices || !j.prices.length) return null;
      let prices = j.prices.map(p => ({ t: p[0], v: p[1] }));
      if (prices.length > MAX_POINTS) {
        const step = Math.ceil(prices.length / MAX_POINTS);
        prices = prices.filter((_, i) => i % step === 0);
      }
      return prices;
    }

    // days param
    const rDef = RANGES.find(r => r.id === rangeId) || {};
    const daysParam = rDef.days || 1;
    const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}/market_chart?vs_currency=usd&days=${daysParam}`;
    const res = await fetchWithRetry(url, {}, 4);
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
    const json = await res.json();
    if (!json.prices || !json.prices.length) return null;
    let prices = json.prices.map(p => ({ t: p[0], v: p[1] }));
    if (prices.length > MAX_POINTS) {
      const step = Math.ceil(prices.length / MAX_POINTS);
      prices = prices.filter((_, i) => i % step === 0);
    }
    return prices;
  } catch (err) {
    throw err;
  }
}

async function fetchCoinSummary(coinId) {
  const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`;
  const res = await fetchWithRetry(url, {}, 4);
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
  return res.json();
}

// Genera todas las imágenes + summary en cache para un símbolo (si no existe o expiró) -> retorna cacheEntry
async function generateCacheForSymbol(symbol, coinId) {
  const key = symbol.toLowerCase();
  const now = Date.now();
  const existing = cache[key];
  if (existing && existing.expiresAt > now) return existing;

  // crear nueva entrada
  const entry = {
    createdAt: now,
    expiresAt: now + CACHE_TTL,
    images: {}, // rangeId -> url
    lastValues: {}, // rangeId -> { first, last, change }
    summary: null
  };

  // obtener summary primero (una sola vez)
  try {
    entry.summary = await fetchCoinSummary(coinId);
  } catch (e) {
    // no fatal, summary puede ser null
    entry.summary = null;
  }

  // Generar charts secuencialmente para evitar sobrecarga / rate limits
  for (const r of RANGES) {
    try {
      const prices = await fetchMarketData(coinId, r.id);
      if (!prices || !prices.length) {
        entry.images[r.id] = null;
        entry.lastValues[r.id] = null;
        continue;
      }

      const labels = prices.map(p => {
        const d = new Date(p.t);
        // etiqueta compacta
        return `${d.toLocaleDateString('en-US')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
      });
      const vals = prices.map(p => Number(p.v));
      const first = vals[0];
      const last = vals[vals.length - 1];
      const changePct = first && first !== 0 ? ((last - first) / first * 100) : 0;
      entry.lastValues[r.id] = { first, last, change: changePct };

      // crear chart en QuickChart
      const title = `${symbol.toUpperCase()} · ${money(last)} · ${Number(changePct).toFixed(2)}%`;
      const url = await createQuickChartUrl(labels, vals.map(v => Number(v.toFixed(8))), title);
      entry.images[r.id] = url;
      // pequeño delay para no saturar
      await sleep(QUICKCHART_DELAY_MS);
    } catch (err) {
      // en fallo dejamos null y continuamos
      console.error(`cryptochart: error generando rango ${r.id} para ${symbol}:`, err.message || err);
      entry.images[r.id] = null;
      entry.lastValues[r.id] = null;
      // si CoinGecko 429 u otro error grave, no abortamos totalmente para intentar generar lo que podamos
      await sleep(250);
    }
  }

  cache[key] = entry;

  // programar limpieza automática al expirar (opcional)
  setTimeout(() => {
    if (cache[key] && cache[key].expiresAt <= Date.now()) {
      delete cache[key];
    }
  }, CACHE_TTL + 2000);

  return entry;
}

// Construir embed usando datos pre-caché (o summary si está)
function buildEmbedFromCache(symbol, entry, rangeId) {
  const lastInfo = entry.lastValues[rangeId] || null;
  const img = entry.images[rangeId] || null;
  const summary = entry.summary;

  const titleLabel = RANGES.find(r => r.id === rangeId)?.label || rangeId;
  const last = lastInfo?.last ?? (summary?.market_data?.current_price?.usd ?? null);
  const changePct = lastInfo?.change ?? (summary?.market_data?.price_change_percentage_24h ?? null);

  const embed = new EmbedBuilder()
    .setTitle(`${symbol.toUpperCase()} — ${titleLabel}`)
    .setDescription(`Último: **${last ? money(last) : 'N/A'}** • Cambio: **${changePct != null ? Number(changePct).toFixed(2) + '%' : 'N/A'}**`)
    .setColor(COLORS.main)
    .setTimestamp();

  if (img) embed.setImage(img);

  if (summary?.market_data) {
    const md = summary.market_data;
    const rank = summary.market_cap_rank ? `#${summary.market_cap_rank}` : 'N/A';
    const ch1 = md.price_change_percentage_1h_in_currency?.usd ?? null;
    const ch24 = md.price_change_percentage_24h_in_currency?.usd ?? null;
    const ch7 = md.price_change_percentage_7d_in_currency?.usd ?? null;

    embed.addFields(
      { name: 'Market cap', value: md.market_cap?.usd ? `${money(md.market_cap.usd)} (${rank})` : 'N/A', inline: true },
      { name: 'Price', value: md.current_price?.usd ? money(md.current_price.usd) : 'N/A', inline: true },
      { name: 'Change 1h', value: ch1 != null ? `${ch1 >= 0 ? '🔺' : '🔻'} ${percent(ch1)}` : 'N/A', inline: true },
      { name: 'Change 24h', value: ch24 != null ? `${ch24 >= 0 ? '🔺' : '🔻'} ${percent(ch24)}` : 'N/A', inline: true },
      { name: 'Change 7d', value: ch7 != null ? `${ch7 >= 0 ? '🔺' : '🔻'} ${percent(ch7)}` : 'N/A', inline: true },
      { name: 'ATH', value: md.ath?.usd ? money(md.ath.usd) : 'N/A', inline: true },
      { name: 'ATL', value: md.atl?.usd ? money(md.atl.usd) : 'N/A', inline: true }
    );

    if (summary.image?.large) embed.setThumbnail(summary.image.large);
    embed.setFooter({ text: 'Data fetched from CoinGecko.com' });
  } else {
    embed.addFields({ name: 'Fuente', value: 'CoinGecko (resumen no disponible)', inline: true });
  }

  return embed;
}

// Construye el select menu (solo 1 ActionRow con 1 Select)
function buildSelectRow(symbol, disabled = false) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`cryptochart_select:${symbol}`)
    .setPlaceholder('Selecciona rango')
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(Boolean(disabled))
    .addOptions(RANGES.map(r => ({ label: r.label, value: r.id })));
  return [new ActionRowBuilder().addComponents(menu)];
}

// Maneja cooldown por usuario
function getCooldownRemaining(userId) {
  const now = Date.now();
  const last = userCooldowns.get(userId) || 0;
  const rem = last + COOLDOWN_MS - now;
  if (rem > 0) return rem;
  userCooldowns.set(userId, now);
  return 0;
}

module.exports = {
  name: 'cryptochart',
  description: 'Muestra gráfica avanzada y métricas de una moneda (menu de rangos).',
  category: 'Criptos',
  ejemplo: 'cryptochart btc',
  syntax: '!cryptochart <moneda>',

  data: new SlashCommandBuilder()
    .setName('cryptochart')
    .setDescription('Muestra gráfica de precio con rangos y métricas')
    .addStringOption(opt => opt.setName('moneda').setDescription('btc, eth, sol, bnb, xrp, doge (o id)').setRequired(true)),

  // === Modo prefijo (mensaje)
  async executeMessage(msg, args) {
    try {
      const cd = getCooldownRemaining(msg.author.id);
      if (cd > 0) {
        const unlock = Math.floor((Date.now() + cd) / 1000);
        return msg.reply({ embeds: [new EmbedBuilder().setTitle('Espera un momento').setDescription(`Puedes volver a intentarlo <t:${unlock}:R>`).setColor(COLORS.error)] });
      }

      const raw = (args[0] || '').toLowerCase();
      if (!raw) return msg.channel.send({ embeds: [new EmbedBuilder().setTitle('Uso incorrecto').setDescription('Ej: `!cryptochart btc`').setColor(COLORS.error)] });

      const coinId = resolveCoinId(raw);
      // Generar cache (crea las 6 imágenes y summary) - puede tardar unos segundos
      const notice = await msg.channel.send({ content: `Generando gráficos y datos para **${raw.toUpperCase()}**...` });
      let entry;
      try {
        entry = await generateCacheForSymbol(raw, coinId);
      } catch (err) {
        console.error('cryptochart generateCache error:', err);
        await notice.delete().catch(() => {});
        return msg.channel.send({ embeds: [new EmbedBuilder().setTitle('Error').setDescription('No pude obtener datos de CoinGecko o QuickChart. Intenta más tarde.').setColor(COLORS.error)] });
      }

      // Build embed por defecto con rango 24h (primer item)
      const defaultRange = '24h';
      const embed = buildEmbedFromCache(raw, entry, defaultRange);
      const components = buildSelectRow(raw, false);

      // enviar mensaje público
      const sent = await msg.channel.send({ embeds: [embed], components });

      // borrar el notice y programar desactivar select a los 10 minutos
      await notice.delete().catch(() => {});
      // programar desactivar en 10 minutos
      setTimeout(async () => {
        try {
          // editar mensaje para deshabilitar menu (si sigue disponible)
          const ch = await msg.client.channels.fetch(sent.channelId).catch(() => null);
          if (!ch) return;
          const m = await ch.messages.fetch(sent.id).catch(() => null);
          if (!m) return;
          const disabledComponents = buildSelectRow(raw, true);
          await m.edit({ components: disabledComponents }).catch(() => {});
        } catch (e) { /* ignore */ }
      }, CACHE_TTL);

      return;
    } catch (err) {
      console.error('cryptochart executeMessage error:', err);
      return msg.channel.send({ embeds: [new EmbedBuilder().setTitle('Error interno').setDescription('Ocurrió un error.').setColor(COLORS.error)] });
    }
  },

  // === Modo slash
  async executeInteraction(interaction) {
    try {
      const cd = getCooldownRemaining(interaction.user.id);
      if (cd > 0) {
        const unlock = Math.floor((Date.now() + cd) / 1000);
        return interaction.reply({ embeds: [new EmbedBuilder().setTitle('Espera un momento').setDescription(`Puedes volver a intentarlo <t:${unlock}:R>`).setColor(COLORS.error)], ephemeral: true });
      }

      const raw = (interaction.options.getString('moneda') || '').toLowerCase();
      if (!raw) return interaction.reply({ embeds: [new EmbedBuilder().setTitle('Uso incorrecto').setDescription('Ej: `/cryptochart moneda:btc`').setColor(COLORS.error)], ephemeral: true });

      const coinId = resolveCoinId(raw);

      // deferimos porque puede tardar
      await interaction.deferReply();

      let entry;
      try {
        entry = await generateCacheForSymbol(raw, coinId);
      } catch (err) {
        console.error('cryptochart generateCache error (slash):', err);
        return interaction.editReply({ embeds: [new EmbedBuilder().setTitle('Error').setDescription('No pude obtener datos de CoinGecko o QuickChart. Intenta más tarde.').setColor(COLORS.error)] });
      }

      const defaultRange = '24h';
      const embed = buildEmbedFromCache(raw, entry, defaultRange);
      const components = buildSelectRow(raw, false);

      const sent = await interaction.editReply({ embeds: [embed], components });

      // programar desactivar select a los 10 minutos
      setTimeout(async () => {
        try {
          const ch = await interaction.client.channels.fetch(sent.channelId).catch(() => null);
          if (!ch) return;
          const m = await ch.messages.fetch(sent.id).catch(() => null);
          if (!m) return;
          const disabledComponents = buildSelectRow(raw, true);
          await m.edit({ components: disabledComponents }).catch(() => {});
        } catch (e) { /* ignore */ }
      }, CACHE_TTL);

      return;
    } catch (err) {
      console.error('cryptochart executeInteraction error:', err);
      if (!interaction.replied && !interaction.deferred) {
        return interaction.reply({ embeds: [new EmbedBuilder().setTitle('Error interno').setDescription('Ocurrió un error.').setColor(COLORS.error)], ephemeral: true });
      } else {
        return interaction.editReply({ embeds: [new EmbedBuilder().setTitle('Error interno').setDescription('Ocurrió un error.').setColor(COLORS.error)] }).catch(() => {});
      }
    }
  },

  // === Manejo del select menu
  async handleInteraction(interaction) {
    try {
      if (!interaction.isStringSelectMenu()) return;
      if (!interaction.customId || !interaction.customId.startsWith('cryptochart_select:')) return;

      const symbol = interaction.customId.split(':')[1];
      const rangeId = interaction.values?.[0];
      if (!symbol || !rangeId) return interaction.reply({ content: 'Selección inválida', ephemeral: true });

      // No aplicar cooldown para seleccionar (solo para ejecutar comando inicial)
      // usar cache si existe
      const key = symbol.toLowerCase();
      const entry = cache[key];
      if (!entry || entry.expiresAt <= Date.now()) {
        // cache inexistente/expirada -> regenerar (pero no spam)
        await interaction.deferUpdate();
        try {
          const coinId = resolveCoinId(symbol);
          const newEntry = await generateCacheForSymbol(symbol, coinId);
          const embedN = buildEmbedFromCache(symbol, newEntry, rangeId);
          const components = buildSelectRow(symbol, false);
          return interaction.editReply ? interaction.editReply({ embeds: [embedN], components }).catch(() => interaction.update({ embeds: [embedN], components })) : interaction.update({ embeds: [embedN], components });
        } catch (err) {
          console.error('cryptochart handleInteraction regen error:', err);
          return interaction.update({ content: 'No pude generar la gráfica. Intenta más tarde.', embeds: [], components: [] });
        }
      }

      // cache ok -> construir embed usando cache
      const embed = buildEmbedFromCache(symbol, entry, rangeId);
      const components = buildSelectRow(symbol, false);

      // actualizar mensaje (usamos update para select)
      return interaction.update({ embeds: [embed], components });
    } catch (err) {
      console.error('cryptochart handleInteraction error:', err);
      try {
        if (interaction.deferred || interaction.replied) {
          return interaction.editReply ? interaction.editReply({ embeds: [new EmbedBuilder().setTitle('Error').setDescription('Ocurrió un error al procesar la selección.').setColor(COLORS.error)] }) : interaction.update({ embeds: [new EmbedBuilder().setTitle('Error').setDescription('Ocurrió un error al procesar la selección.').setColor(COLORS.error)] });
        } else {
          return interaction.reply({ embeds: [new EmbedBuilder().setTitle('Error').setDescription('Ocurrió un error al procesar la selección.').setColor(COLORS.error)], ephemeral: true });
        }
      } catch (e) { /* swallow */ }
    }
  }
};
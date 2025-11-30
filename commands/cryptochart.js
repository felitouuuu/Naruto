// commands/cryptochart.js
const {
  EmbedBuilder,
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder
} = require('discord.js');

const fetch = globalThis.fetch || require('node-fetch');
const { COINS } = require('../utils/cryptoUtils');

const QUICKCHART_CREATE = 'https://quickchart.io/chart/create';
const COLORS = { main: '#6A0DAD', error: '#ED4245' };
const MAX_POINTS = 240;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutos
const GENERATION_PAUSE_MS = 600; // pausa entre requests para evitar rate limits
const COINGECKO_MAX_RETRIES = 3;
const QUICKCHART_MAX_RETRIES = 3;

// RANGOS: los que pediste (etiqueta y days param para CoinGecko)
const RANGES = [
  { id: '24h', label: 'Último día', days: 1 },
  { id: '7d', label: 'Últimos 7d', days: 7 },
  { id: '30d', label: 'Últimos 30d', days: 30 },
  { id: '120d', label: 'Últimos 4 meses', days: 120 },
  { id: '365d', label: 'Último año', days: 365 },
  { id: 'max', label: 'Total recorrido', days: 'max' }
];

function money(n) {
  if (n == null) return 'N/A';
  return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function percent(n) {
  if (n == null) return 'N/A';
  return `${Number(n).toFixed(2)}%`;
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Simple exponential-backoff fetch wrapper for CoinGecko/QuickChart
async function safeFetch(url, opts = {}, maxRetries = 3) {
  let attempt = 0;
  let backoff = 700;
  while (true) {
    attempt++;
    try {
      const res = await fetch(url, opts);
      if (res.status === 429) {
        // try to read Retry-After
        const ra = res.headers && (res.headers.get('retry-after') || res.headers.get('Retry-After'));
        const wait = ra ? (Number(ra) * 1000) : backoff;
        if (attempt > maxRetries) throw new Error(`429 Too Many Requests`);
        await sleep(wait);
        backoff *= 2;
        continue;
      }
      return res;
    } catch (err) {
      if (attempt >= maxRetries) throw err;
      await sleep(backoff);
      backoff *= 2;
    }
  }
}

// QuickChart: crea grafica via POST -> devuelve url (render)
async function createQuickChartUrl(labels, values, title, color = 'rgb(106,13,173)') {
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
          ticks: { callback: function(v) { return (typeof v === 'number') ? ('$' + Number(v).toLocaleString()) : v; } }
        }
      },
      elements: { line: { borderWidth: 2 } }
    }
  };

  const body = { chart: cfg, backgroundColor: 'transparent', width: 1200, height: 420 };
  // usar safeFetch con reintentos
  const res = await safeFetch(QUICKCHART_CREATE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }, QUICKCHART_MAX_RETRIES);

  if (!res.ok) throw new Error(`QuickChart ${res.status}`);
  const json = await res.json();
  return json.url || null;
}

// Resolve coin id from symbol or id using COINS map (utils/cryptoUtils)
function resolveCoinId(input) {
  if (!input) return null;
  const s = input.toLowerCase();
  return COINS[s] || s;
}

// Fetch market price series from CoinGecko
async function fetchMarketData(coinId, rangeId) {
  const now = Math.floor(Date.now() / 1000);
  // 24h..max: use /market_chart with days param; for 1h we'd use range endpoint (not needed here)
  const range = RANGES.find(r => r.id === rangeId);
  if (!range) throw new Error('Rango no soportado');

  let url;
  if (rangeId === 'max') {
    url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}/market_chart?vs_currency=usd&days=max`;
  } else {
    url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}/market_chart?vs_currency=usd&days=${range.days}`;
  }

  const res = await safeFetch(url, { headers: { 'Accept': 'application/json' } }, COINGECKO_MAX_RETRIES);
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
  const json = await res.json();
  if (!json.prices || !Array.isArray(json.prices) || json.prices.length === 0) return null;

  // map to {t, v} and sample to MAX_POINTS
  let prices = json.prices.map(p => ({ t: p[0], v: p[1] }));
  if (prices.length > MAX_POINTS) {
    const step = Math.ceil(prices.length / MAX_POINTS);
    prices = prices.filter((_, i) => i % step === 0);
  }
  return prices;
}

// Fetch coin summary once
async function fetchCoinSummary(coinId) {
  const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`;
  const res = await safeFetch(url, { headers: { 'Accept': 'application/json' } }, COINGECKO_MAX_RETRIES);
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
  return res.json();
}

/**
 * CACHE (en memoria)
 * cacheByCoin[coinId] = {
 *   createdAt: ms,
 *   summary: {...},
 *   images: { rangeId: { url, labelsCount } },
 *   meta: { priceAtGeneration, ... }
 * }
 */
const cacheByCoin = {};

/* Genera (y cachea) summary + images para TODOS los ranges de una moneda.
   - Si ya existe cache reciente, devuelve la cache.
   - Genera secuencialmente (pausa entre requests) para no golpear la API.
*/
async function ensureCacheForCoin(symbol, coinId) {
  const now = Date.now();
  const existing = cacheByCoin[coinId];
  if (existing && (now - existing.createdAt < CACHE_TTL)) return existing;

  // crear nueva cache
  const cacheObj = { createdAt: now, images: {}, summary: null };

  // obtener summary (una sola vez)
  try {
    cacheObj.summary = await fetchCoinSummary(coinId);
  } catch (err) {
    // si falla summary, seguimos tratando de generar imágenes (usaremos fallback en fields)
    cacheObj.summary = null;
  }

  // generar las imágenes para cada rango
  for (const range of RANGES) {
    try {
      // fetch market data
      const prices = await fetchMarketData(coinId, range.id);
      if (!prices || !prices.length) {
        cacheObj.images[range.id] = { url: null, ok: false };
        await sleep(GENERATION_PAUSE_MS);
        continue;
      }

      // labels y valores
      const labels = prices.map(p => {
        const d = new Date(p.t);
        // mostrar fecha/hora corta
        return `${d.toLocaleDateString('en-US')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
      });
      const values = prices.map(p => Number(p.v));

      // título
      const last = values[values.length - 1];
      const first = values[0] || last;
      const changePct = first ? ((last - first) / first * 100) : 0;
      const title = `${symbol.toUpperCase()} · ${money(last)} · ${Number(changePct).toFixed(2)}%`;

      // Create QuickChart URL (with safeFetch inside)
      const url = await createQuickChartUrl(labels, values.map(v => Number(v.toFixed(8))), title);
      cacheObj.images[range.id] = { url: url || null, ok: !!url, labelsCount: labels.length };
      // pausa para no golpear rápido
      await sleep(GENERATION_PAUSE_MS);
    } catch (err) {
      cacheObj.images[range.id] = { url: null, ok: false };
      // no dejamos que falle todo: continuamos con siguiente rango
      await sleep(GENERATION_PAUSE_MS);
    }
  }

  cacheByCoin[coinId] = cacheObj;
  // programar limpieza automática (opcional, pero ttl check evita uso viejo)
  setTimeout(() => {
    if (cacheByCoin[coinId] && (Date.now() - cacheByCoin[coinId].createdAt >= CACHE_TTL)) delete cacheByCoin[coinId];
  }, CACHE_TTL + 1000);

  return cacheObj;
}

// Crea embed usando cache (summary + image for chosen range)
function buildEmbedFromCache(symbol, coinId, rangeId, cacheObj) {
  const summary = cacheObj.summary;
  const imgEntry = cacheObj.images[rangeId] || { url: null, ok: false };

  // Try to pull main fields from summary safely
  const md = summary?.market_data ?? null;
  const marketCap = md?.market_cap?.usd ?? null;
  const vol24 = md?.total_volume?.usd ?? null;
  const priceNow = md?.current_price?.usd ?? null;
  const ch1 = md?.price_change_percentage_1h_in_currency?.usd ?? null;
  const ch24 = md?.price_change_percentage_24h_in_currency?.usd ?? null;
  const ch7 = md?.price_change_percentage_7d_in_currency?.usd ?? null;
  const ath = md?.ath?.usd ?? null;
  const atl = md?.atl?.usd ?? null;
  const coinImg = summary?.image?.large || null;
  const rank = summary?.market_cap_rank ? `#${summary.market_cap_rank}` : 'N/A';

  // For change percent in title, fallback to 'N/A' if summary not present
  const priceDisplay = priceNow ? money(priceNow) : 'N/A';
  const title = `${symbol.toUpperCase()} — ${RANGES.find(r => r.id === rangeId)?.label || rangeId}`;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(`Price: **${priceDisplay}**`)
    .setColor(COLORS.main)
    .setTimestamp();

  if (imgEntry && imgEntry.ok && imgEntry.url) {
    embed.setImage(imgEntry.url);
  } else {
    // no image available
    embed.setDescription(embed.data.description + '\n\nImagen: _No disponible_');
  }

  // Fields (market cap, price, changes, ATH/ATL)
  embed.addFields(
    { name: 'Market cap', value: marketCap ? money(marketCap) + ` (${rank})` : 'N/A', inline: true },
    { name: 'Price actual', value: priceNow ? money(priceNow) : 'N/A', inline: true },
    { name: 'Change 1h', value: ch1 != null ? `${ch1 >= 0 ? '🔺' : '🔻'} ${percent(ch1)}` : 'N/A', inline: true },
    { name: 'Change 24h', value: ch24 != null ? `${ch24 >= 0 ? '🔺' : '🔻'} ${percent(ch24)}` : 'N/A', inline: true },
    { name: 'Change 7d', value: ch7 != null ? `${ch7 >= 0 ? '🔺' : '🔻'} ${percent(ch7)}` : 'N/A', inline: true },
    { name: 'ATH / ATL', value: (ath ? money(ath) : 'N/A') + ' / ' + (atl ? money(atl) : 'N/A'), inline: true }
  );

  if (coinImg) embed.setThumbnail(coinImg);
  embed.setFooter({ text: 'Data from CoinGecko.com — Cached for 10 minutes' });

  return embed;
}

// Construye menú select con los 6 ranges (max 1 seleccionado)
function buildSelectMenu(symbol) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`cryptochart_select:${symbol}`)
    .setPlaceholder('Selecciona rango')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(RANGES.map(r => ({ label: r.label, value: r.id })));
  return [new ActionRowBuilder().addComponents(menu)];
}

// Disable components (remove them) after TTL: edit message to remove components
async function scheduleDisableComponents(message, ttl = CACHE_TTL) {
  setTimeout(async () => {
    try {
      // check message still exists
      await message.edit({ components: [] }).catch(() => {});
    } catch (e) {}
  }, ttl);
}

module.exports = {
  name: 'cryptochart',
  description: 'Muestra gráfica y métricas (menu de rangos).',
  category: 'Criptos',
  ejemplo: 'cryptochart btc',
  syntax: '!cryptochart <moneda>',

  data: new SlashCommandBuilder()
    .setName('cryptochart')
    .setDescription('Muestra gráfico y métricas de una moneda')
    .addStringOption(opt => opt.setName('moneda').setDescription('btc, eth, sol, bnb, xrp, doge (o id)').setRequired(true)),

  // --- Prefijo
  async executeMessage(msg, args) {
    const raw = (args[0] || '').toLowerCase();
    if (!raw) return msg.channel.send({ embeds: [new EmbedBuilder().setTitle('Uso incorrecto').setDescription('Ej: `!cryptochart btc`').setColor(COLORS.error)] });

    const coinId = resolveCoinId(raw);
    if (!coinId) return msg.channel.send({ embeds: [new EmbedBuilder().setTitle('Moneda no soportada').setColor(COLORS.error)] });

    // pre-generate & cache images + summary
    let cacheObj;
    try {
      cacheObj = await ensureCacheForCoin(raw, coinId);
    } catch (err) {
      console.error('cryptochart ensureCache error:', err);
      return msg.channel.send({ embeds: [new EmbedBuilder().setTitle('Error').setDescription('No pude obtener datos de CoinGecko / QuickChart. Intenta más tarde.').setColor(COLORS.error)] });
    }

    // build embed from cached content (default range = 24h)
    const embed = buildEmbedFromCache(raw, coinId, '24h', cacheObj);
    const components = buildSelectMenu(raw);

    try {
      const sent = await msg.channel.send({ embeds: [embed], components });
      // desactivar el menu después de CACHE_TTL (10min)
      scheduleDisableComponents(sent, CACHE_TTL);
    } catch (err) {
      console.error('cryptochart send error:', err);
      return msg.channel.send({ embeds: [new EmbedBuilder().setTitle('Error').setDescription('No pude enviar el embed.').setColor(COLORS.error)] });
    }
  },

  // --- Slash
  async executeInteraction(interaction) {
    const raw = (interaction.options.getString('moneda') || '').toLowerCase();
    if (!raw) return interaction.reply({ embeds: [new EmbedBuilder().setTitle('Uso incorrecto').setDescription('Ej: `/cryptochart moneda:btc`').setColor(COLORS.error)], ephemeral: true });

    const coinId = resolveCoinId(raw);
    if (!coinId) return interaction.reply({ embeds: [new EmbedBuilder().setTitle('Moneda no soportada').setColor(COLORS.error)], ephemeral: true });

    let cacheObj;
    try {
      cacheObj = await ensureCacheForCoin(raw, coinId);
    } catch (err) {
      console.error('cryptochart ensureCache error (slash):', err);
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('Error').setDescription('No pude obtener datos de CoinGecko / QuickChart. Intenta más tarde.').setColor(COLORS.error)], ephemeral: true });
    }

    const embed = buildEmbedFromCache(raw, coinId, '24h', cacheObj);
    const components = buildSelectMenu(raw);

    try {
      const reply = await interaction.reply({ embeds: [embed], components, fetchReply: true, ephemeral: false });
      // schedule disable of components
      scheduleDisableComponents(reply, CACHE_TTL);
    } catch (err) {
      console.error('cryptochart reply error:', err);
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('Error').setDescription('No pude enviar el embed.').setColor(COLORS.error)], ephemeral: true });
    }
  },

  // --- Manejo del select menu
  async handleInteraction(interaction) {
    if (!interaction.isStringSelectMenu()) return;
    if (!interaction.customId || !interaction.customId.startsWith('cryptochart_select:')) return;

    const symbol = interaction.customId.split(':', 2)[1];
    const selected = interaction.values && interaction.values[0];
    if (!selected) return interaction.reply({ content: 'Seleccion inválida', ephemeral: true });

    const coinId = resolveCoinId(symbol);
    if (!coinId) return interaction.update({ content: 'Moneda no soportada', components: [], embeds: [] });

    // ensure cache (if expired will re-generate)
    let cacheObj;
    try {
      cacheObj = await ensureCacheForCoin(symbol, coinId);
    } catch (err) {
      console.error('cryptochart ensureCache on select error:', err);
      return interaction.update({ content: 'Error obteniendo datos, intenta de nuevo más tarde.', components: [], embeds: [] });
    }

    // build embed for selected range using cache
    const embed = buildEmbedFromCache(symbol, coinId, selected, cacheObj);
    const components = buildSelectMenu(symbol);

    try {
      // update message (edita embed y mantiene el mismo menu)
      await interaction.update({ embeds: [embed], components });
    } catch (err) {
      console.error('cryptochart select update error:', err);
      try { await interaction.reply({ content: 'Error actualizando la gráfica.', ephemeral: true }); } catch (_) {}
    }
  }
};
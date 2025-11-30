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
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutos
const COOLDOWN_MS = 10 * 1000; // 10s por usuario
const GEN_CONCURRENCY = 3; // cuantas imágenes generar en paralelo

// RANGOS solicitados (sin 'max', con '1h')
const RANGES = [
  { id: '1h', label: 'Última hora', days: null },
  { id: '24h', label: 'Último día', days: 1 },
  { id: '7d', label: 'Últimos 7d', days: 7 },
  { id: '30d', label: 'Últimos 30d', days: 30 },
  { id: '120d', label: 'Últimos 4 meses', days: 120 },
  { id: '365d', label: 'Último año', days: 365 }
];

// caches
// cacheMap: coinId -> { createdAt, images: { rangeId: url }, summarySnapshot, summaryTimestamp }
const cacheMap = new Map();
// cooldowns userId -> timestamp
const cooldowns = new Map();

// utilitarios
function money(n) { return n == null ? 'N/A' : `$${Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`; }
function percent(n) { return n == null ? 'N/A' : `${Number(n).toFixed(2)}%`; }
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

// limitada concurrencia (batch runner simple)
async function runInBatches(items, batchSize, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const res = await Promise.all(batch.map(x => fn(x).catch(e => ({ __err: e }))));
    out.push(...res);
    // pequeña pausa entre batches para reducir presión
    await sleep(150);
  }
  return out;
}

// QuickChart: POST para obtener URL corta (mejor que construir URL enorme)
async function createQuickChartUrl(labels, values, title, color='rgb(106,13,173)') {
  const cfg = {
    type: 'line',
    data: { labels, datasets: [{ label: title, data: values, fill: true, borderColor: color, backgroundColor: color, pointRadius: 0, tension: 0.12 }] },
    options: {
      plugins: { legend: { display: false }, title: { display: true, text: title, font: { size: 16 } } },
      scales: { x: { display: false }, y: { ticks: { callback: v => typeof v === 'number' ? ('$' + Number(v).toLocaleString()) : v } } },
      elements: { line: { borderWidth: 2 } }
    }
  };

  const body = { chart: cfg, backgroundColor: 'transparent', width: 1200, height: 420 };
  const res = await fetch(QUICKCHART_CREATE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    // no timeout nativo aquí; la infra debe aguantar
  });
  if (!res.ok) throw new Error(`QuickChart ${res.status}`);
  const j = await res.json();
  return j.url || null;
}

// CoinGecko fetching con reintentos/backoff en 429
async function cgFetchJson(url, attempts = 4) {
  let backoff = 800;
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (res.status === 429) {
      // rate limited -> wait and retry
      await sleep(backoff);
      backoff *= 2;
      continue;
    }
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
    return res.json();
  }
  throw new Error('CoinGecko rate limit / no response');
}

// obtiene prices (soporta 1h via endpoint range)
async function fetchMarketData(coinId, rangeId) {
  const now = Math.floor(Date.now() / 1000);
  if (rangeId === '1h') {
    const from = now - 3600;
    const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}/market_chart/range?vs_currency=usd&from=${from}&to=${now}`;
    const j = await cgFetchJson(url);
    if (!j.prices || !Array.isArray(j.prices) || j.prices.length === 0) return null;
    let prices = j.prices.map(p => ({ t: p[0], v: p[1] }));
    if (prices.length > MAX_POINTS) {
      const step = Math.ceil(prices.length / MAX_POINTS);
      prices = prices.filter((_,i) => i % step === 0);
    }
    return prices;
  }

  // other ranges use market_chart days param
  const r = RANGES.find(x => x.id === rangeId);
  const days = r ? r.days : 1;
  const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}/market_chart?vs_currency=usd&days=${days}`;
  const j = await cgFetchJson(url);
  if (!j.prices || !Array.isArray(j.prices) || j.prices.length === 0) return null;
  let prices = j.prices.map(p => ({ t: p[0], v: p[1] }));
  if (prices.length > MAX_POINTS) {
    const step = Math.ceil(prices.length / MAX_POINTS);
    prices = prices.filter((_,i) => i % step === 0);
  }
  return prices;
}

// obtiene summary (market_data)
async function fetchCoinSummary(coinId) {
  const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`;
  return await cgFetchJson(url);
}

// genera embed (con imagen ya creada por createQuickChartUrl) - summary puede actualizarse por separado
async function buildEmbedFromCache(symbol, rangeId, imageUrl, summaryFresh) {
  // summaryFresh es el objeto market_data (fetch reciente) o null
  const titleSuffix = `${symbol.toUpperCase()} — ${RANGES.find(r=>r.id===rangeId)?.label || rangeId}`;
  const lastPrice = summaryFresh?.market_data?.current_price?.usd ?? null;
  const change1h = summaryFresh?.market_data?.price_change_percentage_1h_in_currency?.usd ?? null;
  const change24 = summaryFresh?.market_data?.price_change_percentage_24h_in_currency?.usd ?? null;
  const change7 = summaryFresh?.market_data?.price_change_percentage_7d_in_currency?.usd ?? null;
  const marketCap = summaryFresh?.market_data?.market_cap?.usd ?? null;
  const ath = summaryFresh?.market_data?.ath?.usd ?? null;
  const atl = summaryFresh?.market_data?.atl?.usd ?? null;
  const athDate = summaryFresh?.market_data?.ath_date?.usd ? new Date(summaryFresh.market_data.ath_date.usd) : null;
  const atlDate = summaryFresh?.market_data?.atl_date?.usd ? new Date(summaryFresh.market_data.atl_date.usd) : null;

  const embed = new EmbedBuilder()
    .setTitle(titleSuffix)
    .setDescription(`Último: **${lastPrice ? money(lastPrice) : 'N/A'}**`)
    .setColor(COLORS.main)
    .setImage(imageUrl)
    .setTimestamp();

  embed.addFields(
    { name: 'Market cap', value: marketCap ? money(marketCap) : 'N/A', inline: true },
    { name: 'Price', value: lastPrice ? money(lastPrice) : 'N/A', inline: true },
    { name: 'Change 1h', value: change1h !== undefined && change1h !== null ? `${change1h >= 0 ? '🔺' : '🔻'} ${percent(change1h)}` : 'N/A', inline: true },
    { name: 'Change 24h', value: change24 !== undefined && change24 !== null ? `${change24 >= 0 ? '🔺' : '🔻'} ${percent(change24)}` : 'N/A', inline: true },
    { name: 'Change 7d', value: change7 !== undefined && change7 !== null ? `${change7 >= 0 ? '🔺' : '🔻'} ${percent(change7)}` : 'N/A', inline: true },
    { name: 'ATH', value: ath ? `${money(ath)} (${athDate ? athDate.toLocaleDateString() : 'N/A'})` : 'N/A', inline: true },
    { name: 'ATL', value: atl ? `${money(atl)} (${atlDate ? atlDate.toLocaleDateString() : 'N/A'})` : 'N/A', inline: true }
  );

  if (summaryFresh?.image?.large) embed.setThumbnail(summaryFresh.image.large);
  embed.setFooter({ text: 'Data from CoinGecko.com' });

  return embed;
}

// genera todas las imágenes (o reutiliza cache si existe y no expiró)
// retorna { images: { rangeId: url }, summarySnapshot }
async function ensureCacheForCoin(coinId, symbol) {
  const now = Date.now();
  const existing = cacheMap.get(coinId);
  if (existing && (now - existing.createdAt) < CACHE_TTL_MS) {
    // ya cacheado y válido (no regenerar ahora)
    return existing;
  }

  // vamos a generar: summary snapshot (lo guardamos) y las images por rango
  let summarySnapshot = null;
  try {
    summarySnapshot = await fetchCoinSummary(coinId);
  } catch (e) {
    // si falla summary, dejamos null pero continuamos (no fatal)
    summarySnapshot = null;
  }

  // generamos imágenes por rango con concurrencia limitada
  const rangesToGen = RANGES.map(r => r.id);
  const results = await runInBatches(rangesToGen, GEN_CONCURRENCY, async (rangeId) => {
    try {
      const prices = await fetchMarketData(coinId, rangeId);
      if (!prices || prices.length === 0) throw new Error('no-prices');
      // Labels: fechas compactas
      const labels = prices.map(p => {
        const d = new Date(p.t);
        return `${d.toLocaleDateString('en-US')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
      });
      const values = prices.map(p => Number(p.v));
      // título breve para la imagen
      const first = values[0], last = values[values.length - 1];
      const change = first ? ((last - first)/first*100) : 0;
      const title = `${symbol.toUpperCase()} · ${money(last)} · ${Number(change).toFixed(2)}%`;
      const url = await createQuickChartUrl(labels, values.map(v => Number(v.toFixed(6))), title);
      return { rangeId, url };
    } catch (err) {
      return { rangeId, err };
    }
  });

  const images = {};
  for (const r of results) {
    if (r && r.url) images[r.rangeId] = r.url;
    else images[r.rangeId] = null;
  }

  const payload = { createdAt: Date.now(), images, summarySnapshot };
  cacheMap.set(coinId, payload);
  // schedule cache cleanup after TTL (safety)
  setTimeout(() => {
    const cur = cacheMap.get(coinId);
    if (cur && (Date.now() - cur.createdAt) >= CACHE_TTL_MS) cacheMap.delete(coinId);
  }, CACHE_TTL_MS + 1000);

  return payload;
}

// construye el select menu (1 select)
function buildSelectMenu(symbol) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`cryptochart_select:${symbol}`)
    .setPlaceholder('Selecciona rango')
    .addOptions(RANGES.map(r => ({ label: r.label, value: r.id })))
    .setMinValues(1).setMaxValues(1);

  const row = new ActionRowBuilder().addComponents(menu);
  return [row];
}

// cooldown check
function getCooldownRemaining(userId) {
  const now = Date.now();
  const last = cooldowns.get(userId) || 0;
  if (now - last < COOLDOWN_MS) return COOLDOWN_MS - (now - last);
  cooldowns.set(userId, now);
  return 0;
}

// EXPORT COMMAND
module.exports = {
  name: 'cryptochart',
  description: 'Muestra gráfica y métricas de una moneda (menú de rangos).',
  category: 'Criptos',
  ejemplo: 'cryptochart btc',
  syntax: '!cryptochart <moneda>',

  data: new SlashCommandBuilder()
    .setName('cryptochart')
    .setDescription('Muestra gráfica con rangos y métricas')
    .addStringOption(opt => opt.setName('moneda').setDescription('btc, eth, sol, bnb, xrp, doge (o id)').setRequired(true)),

  // Mensaje (prefijo)
  async executeMessage(msg, args) {
    const rem = getCooldownRemaining(msg.author.id);
    if (rem > 0) {
      const unlock = Math.floor((Date.now() + rem) / 1000);
      return msg.reply({ embeds: [ new EmbedBuilder().setTitle('Whoo! Vas muy rápido').setDescription(`Podrás volver a ejecutar este comando <t:${unlock}:R>.`).setColor(COLORS.error) ] });
    }

    const raw = (args[0] || '').toLowerCase();
    if (!raw) return msg.reply({ embeds: [ new EmbedBuilder().setTitle('Uso incorrecto').setDescription('Ej: `!cryptochart btc`').setColor(COLORS.error) ] });

    const coinId = COINS[raw] || raw;
    // empezar respuesta "generando" para el usuario
    const generating = await msg.channel.send({ content: 'Generando gráficos y datos, espera por favor... (puede tardar unos segundos)', allowedMentions: { repliedUser: false } });

    try {
      const cachePayload = await ensureCacheForCoin(coinId, raw);
      // si no hay imágenes para 24h fallback a error
      const img24 = cachePayload.images['24h'] || cachePayload.images['30d'] || Object.values(cachePayload.images).find(Boolean);
      if (!img24) {
        await generating.edit({ content: null, embeds: [ new EmbedBuilder().setTitle('Error').setDescription('No pude generar la gráfica para esa moneda.').setColor(COLORS.error) ], components: [] });
        return;
      }

      // obtener summary fresco para mostrar precios actuales (no usar snapshot viejo para price)
      let summaryFresh = null;
      try { summaryFresh = await fetchCoinSummary(coinId); } catch (e) { summaryFresh = cachePayload.summarySnapshot; }

      const embed = await buildEmbedFromCache(raw, '24h', img24, summaryFresh);
      const components = buildSelectMenu(raw);
      const sent = await generating.edit({ content: null, embeds: [embed], components });

      // desactivar componentes al cabo de 10min (TTL)
      setTimeout(async () => {
        try { await sent.edit({ components: [] }).catch(()=>{}); } catch {}
      }, CACHE_TTL_MS);

      return;
    } catch (err) {
      console.error('cryptochart error (msg):', err);
      await generating.edit({ content: null, embeds: [ new EmbedBuilder().setTitle('Error').setDescription('No pude generar la gráfica (ver logs).').setColor(COLORS.error) ], components: [] });
      return;
    }
  },

  // Slash
  async executeInteraction(interaction) {
    const rem = getCooldownRemaining(interaction.user.id);
    if (rem > 0) {
      const unlock = Math.floor((Date.now() + rem) / 1000);
      return interaction.reply({ embeds: [ new EmbedBuilder().setTitle('Whoo! Vas muy rápido').setDescription(`Podrás volver a ejecutar este comando <t:${unlock}:R>.`).setColor(COLORS.error) ], ephemeral: true });
    }

    const raw = (interaction.options.getString('moneda') || '').toLowerCase();
    if (!raw) return interaction.reply({ content: 'Debes indicar una moneda.', ephemeral: true });

    // Defer reply porque la generación puede tardar >3s
    await interaction.deferReply();

    const coinId = COINS[raw] || raw;

    try {
      const cachePayload = await ensureCacheForCoin(coinId, raw);
      const img24 = cachePayload.images['24h'] || cachePayload.images['30d'] || Object.values(cachePayload.images).find(Boolean);
      if (!img24) return interaction.editReply({ embeds: [ new EmbedBuilder().setTitle('Error').setDescription('No pude generar la gráfica para esa moneda.').setColor(COLORS.error) ] });

      // fresh summary
      let summaryFresh = null;
      try { summaryFresh = await fetchCoinSummary(coinId); } catch (e) { summaryFresh = cachePayload.summarySnapshot; }

      const embed = await buildEmbedFromCache(raw, '24h', img24, summaryFresh);
      const components = buildSelectMenu(raw);

      const replyMsg = await interaction.editReply({ embeds: [embed], components });
      // disable components after TTL
      setTimeout(async () => {
        try { await replyMsg.edit({ components: [] }).catch(()=>{}); } catch {}
      }, CACHE_TTL_MS);
      return;
    } catch (err) {
      console.error('cryptochart error (slash):', err);
      return interaction.editReply({ embeds: [ new EmbedBuilder().setTitle('Error').setDescription('No pude generar la gráfica (ver logs).').setColor(COLORS.error) ] });
    }
  },

  // Manejo del select menu (rangos)
  async handleInteraction(interaction) {
    if (!interaction.isStringSelectMenu()) return;
    if (!interaction.customId.startsWith('cryptochart_select:')) return;

    // Acknowledge early: deferUpdate para ganar tiempo
    await interaction.deferUpdate();

    const symbol = interaction.customId.split(':')[1];
    const rangeId = interaction.values[0];
    const coinId = COINS[symbol] || symbol;

    try {
      // Si tenemos cache válida usamos la imagen; si no la generamos (ensureCache)
      const cachePayload = await ensureCacheForCoin(coinId, symbol);
      const imageUrl = cachePayload.images[rangeId] || Object.values(cachePayload.images).find(Boolean);
      // siempre intentamos obtener summary fresco (para precio y changes)
      let summaryFresh = null;
      try { summaryFresh = await fetchCoinSummary(coinId); } catch (e) { summaryFresh = cachePayload.summarySnapshot; }

      if (!imageUrl) {
        // fallo en imagen del rango -> informar
        return interaction.message.edit({ embeds: [ new EmbedBuilder().setTitle('Error').setDescription('No pude generar la gráfica para ese rango/moneda.').setColor(COLORS.error) ], components: [] }).catch(()=>{});
      }

      const embed = await buildEmbedFromCache(symbol, rangeId, imageUrl, summaryFresh);
      const components = buildSelectMenu(symbol);

      // editar el mensaje original con nuevo embed + mantener select
      await interaction.message.edit({ embeds: [embed], components }).catch(async (e) => {
        console.error('Error editing message after select:', e);
        try { await interaction.followUp({ embeds: [ new EmbedBuilder().setTitle('Error').setDescription('No pude actualizar el mensaje.').setColor(COLORS.error) ], ephemeral: true }); } catch {}
      });
      return;
    } catch (err) {
      console.error('cryptochart select error:', err);
      try { await interaction.followUp({ embeds: [ new EmbedBuilder().setTitle('Error').setDescription('Ocurrió un error al procesar la selección.').setColor(COLORS.error) ], ephemeral: true }); } catch {}
      return;
    }
  }
};
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

// RANGES y puntos objetivo (resampling)
const RANGES = [
  { id: '1h', label: 'Última hora', points: 60 },
  { id: '1d', label: 'Último día', points: 24 },
  { id: '7d', label: 'Última semana', points: 84 },
  { id: '30d', label: 'Último mes', points: 90 },
  { id: '180d', label: 'Últimos 180d', points: 144 },
  { id: '365d', label: 'Último año', points: 147 },
];

const CACHE_TTL = 10 * 60 * 1000; // 10 min
const COMMAND_COOLDOWN_MS = 10 * 1000; // 10s
const BACKOFF_BASE_MS = 500;
const MAX_RETRIES = 3;

// cache global: coinSymbol -> { ts, images: {rangeId: url}, ohlc: {rangeId: arr}, summary }
const cache = {};
// message -> timeoutId to auto-disable components
const activeMessageTimeouts = new Map();
// cooldowns
const userCooldown = new Map();

function money(n) { return n == null ? 'N/A' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function percent(n) { return n == null ? 'N/A' : `${Number(n).toFixed(2)}%`; }
function resolveCoinId(input) { if (!input) return null; const s = input.toLowerCase(); return COINS[s] || s; }

async function fetchWithRetry(url, opts = {}, retries = MAX_RETRIES) {
  let attempt = 0;
  while (true) {
    try {
      const res = await fetch(url, opts);
      if (res.status === 429) throw { code: 429, res };
      return res;
    } catch (err) {
      attempt++;
      if (attempt > retries) throw err;
      const wait = BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
      await new Promise(r => setTimeout(r, wait));
    }
  }
}

// OHLC: coinGecko /coins/{id}/ohlc?vs_currency=usd&days={1,7,14,30,90,180,365}
async function getOHLC(coinId, days) {
  const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}/ohlc?vs_currency=usd&days=${days}`;
  const res = await fetchWithRetry(url);
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
  const json = await res.json();
  // json = [[timestamp, open, high, low, close], ...]
  return json.map(c => ({ t: c[0], open: c[1], high: c[2], low: c[3], close: c[4] }));
}

// 1h: use market_chart/range (from..to) and sample -> returns array of {t, v}
async function getLastHourPrices(coinId) {
  const now = Math.floor(Date.now() / 1000);
  const from = now - 3600;
  const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}/market_chart/range?vs_currency=usd&from=${from}&to=${now}`;
  const res = await fetchWithRetry(url);
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
  const j = await res.json();
  // j.prices = [[ts, price], ...]
  return (j.prices || []).map(p => ({ t: p[0], v: p[1] }));
}

// resample via linear interpolation to target count of values (input: array of numbers)
function resample(values, targetCount) {
  if (!Array.isArray(values) || values.length === 0) return [];
  if (values.length === targetCount) return values.slice();
  const out = [];
  const n = values.length;
  for (let i = 0; i < targetCount; i++) {
    const pos = (i * (n - 1)) / (targetCount - 1);
    const lo = Math.floor(pos);
    const hi = Math.min(n - 1, Math.ceil(pos));
    if (lo === hi) out.push(values[lo]);
    else {
      const frac = pos - lo;
      out.push(values[lo] + (values[hi] - values[lo]) * frac);
    }
  }
  return out;
}

// createQuickChart: POST to create (returns image url)
async function createQuickChartUrl(labels, values, title, color = 'rgb(106,13,173)') {
  const cfg = {
    type: 'line',
    data: { labels, datasets: [{ label: title, data: values, fill: true, borderColor: color, backgroundColor: color, pointRadius: 0, tension: 0.12 }] },
    options: {
      plugins: { legend: { display: false }, title: { display: true, text: title, font: { size: 16 } } },
      scales: { x: { display: false }, y: { ticks: { callback: v => typeof v === 'number' ? `$${Number(v).toLocaleString()}` : v } } },
      elements: { line: { borderWidth: 2 } }
    }
  };

  const res = await fetchWithRetry(QUICKCHART_CREATE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chart: cfg, backgroundColor: 'transparent', width: 1200, height: 420 })
  });
  if (!res.ok) throw new Error(`QuickChart ${res.status}`);
  const j = await res.json();
  return j.url || null;
}

// fetch coin full summary (includes price/marketcap/changes)
async function fetchSummary(coinId) {
  const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`;
  const res = await fetchWithRetry(url);
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
  return res.json();
}

// Build embed given symbol, rangeId and imageUrl + summary (summary can be partial/fresh)
function buildEmbed(symbol, rangeId, imageUrl, summary) {
  const embed = new EmbedBuilder()
    .setTitle(`${symbol.toUpperCase()} — ${RANGES.find(r => r.id === rangeId)?.label || rangeId}`)
    .setColor(COLORS.main)
    .setImage(imageUrl)
    .setTimestamp();

  if (summary && summary.market_data) {
    const md = summary.market_data;
    embed.setDescription(`Price: **${money(md.current_price?.usd)}** • Change 1h: **${percent(md.price_change_percentage_1h_in_currency?.usd)}** • 24h: **${percent(md.price_change_percentage_24h_in_currency?.usd)}** • 7d: **${percent(md.price_change_percentage_7d_in_currency?.usd)}**`);
    embed.addFields(
      { name: 'Market cap', value: md.market_cap?.usd ? money(md.market_cap.usd) : 'N/A', inline: true },
      { name: 'Price', value: md.current_price?.usd ? money(md.current_price.usd) : 'N/A', inline: true },
      { name: 'Change 1h', value: md.price_change_percentage_1h_in_currency?.usd != null ? (md.price_change_percentage_1h_in_currency.usd >= 0 ? `🔺 ${percent(md.price_change_percentage_1h_in_currency.usd)}` : `🔻 ${percent(md.price_change_percentage_1h_in_currency.usd)}`) : 'N/A', inline: true },
      { name: 'Change 24h', value: md.price_change_percentage_24h_in_currency?.usd != null ? (md.price_change_percentage_24h_in_currency.usd >= 0 ? `🔺 ${percent(md.price_change_percentage_24h_in_currency.usd)}` : `🔻 ${percent(md.price_change_percentage_24h_in_currency.usd)}`) : 'N/A', inline: true },
      { name: 'Change 7d', value: md.price_change_percentage_7d_in_currency?.usd != null ? (md.price_change_percentage_7d_in_currency.usd >= 0 ? `🔺 ${percent(md.price_change_percentage_7d_in_currency.usd)}` : `🔻 ${percent(md.price_change_percentage_7d_in_currency.usd)}`) : 'N/A', inline: true },
      { name: 'ATH', value: md.ath?.usd ? money(md.ath.usd) : 'N/A', inline: true },
      { name: 'ATL', value: md.atl?.usd ? money(md.atl.usd) : 'N/A', inline: true },
    );
    if (summary.image?.large) embed.setThumbnail(summary.image.large);
    embed.setFooter({ text: 'Data from CoinGecko.com' });
  } else {
    embed.setDescription('Resumen no disponible (datos en background).');
    embed.addFields({ name: 'Fuente', value: 'CoinGecko', inline: true });
  }

  return embed;
}

// generate image for a specific range (uses OHLC or 1h range), returns {imageUrl, ohlcValuesArray}
async function generateImageForRange(symbol, coinId, rangeId, targetPoints) {
  // get base series (array of closes)
  let closes = [];
  if (rangeId === '1h') {
    const prices = await getLastHourPrices(coinId);
    if (!prices || prices.length === 0) throw new Error('no-prices-1h');
    // prices are many points - resample to targetPoints
    const arr = prices.map(p => p.v);
    closes = resample(arr, targetPoints);
    // labels: generate timestamps spaced evenly across last hour
    const now = Date.now();
    const stepMs = Math.floor(3600 * 1000 / (targetPoints - 1));
    const labels = Array.from({ length: targetPoints }, (_, i) => {
      const d = new Date(now - (3600 * 1000) + i * stepMs);
      return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
    });
    const chartUrl = await createQuickChartUrl(labels, closes, `${symbol.toUpperCase()} · ${money(closes[closes.length - 1])}`);
    return { imageUrl: chartUrl, closes };
  } else {
    // use OHLC days param (CoinGecko supports 1,7,14,30,90,180,365)
    // choose closest supported days param
    const daysParam = (rangeId === '1d' || rangeId === '24h') ? 1 :
                      (rangeId === '7d') ? 7 :
                      (rangeId === '30d') ? 30 :
                      (rangeId === '180d') ? 180 :
                      (rangeId === '365d') ? 365 : 30;

    const ohlc = await getOHLC(coinId, daysParam); // [{t,open,high,low,close},...]
    if (!ohlc || ohlc.length === 0) throw new Error('no-ohlc');

    // take closes
    const arr = ohlc.map(c => c.close);
    // resample to targetPoints
    const sampled = resample(arr, targetPoints);

    // build labels from original ohlc timestamps linearly resampled
    const firstTs = ohlc[0].t;
    const lastTs = ohlc[ohlc.length - 1].t;
    const labels = [];
    for (let i = 0; i < targetPoints; i++) {
      const pos = i / Math.max(1, targetPoints - 1);
      const ts = Math.round(firstTs + (lastTs - firstTs) * pos);
      const d = new Date(ts);
      labels.push(`${d.getUTCMonth()+1}/${d.getUTCDate()} ${d.getUTCHours().toString().padStart(2,'0')}:${d.getUTCMinutes().toString().padStart(2,'0')}`);
    }

    const chartUrl = await createQuickChartUrl(labels, sampled, `${symbol.toUpperCase()} · ${money(sampled[sampled.length - 1])}`);
    return { imageUrl: chartUrl, closes: sampled };
  }
}

// generate 24h synchronously and start background generation for other ranges; caches results
async function ensureCacheForSymbol(symbol, coinId) {
  const key = symbol.toLowerCase();
  const now = Date.now();

  // if cache exists and fresh -> return
  if (cache[key] && (now - cache[key].ts < CACHE_TTL)) return cache[key];

  // create initial skeleton
  cache[key] = { ts: now, images: {}, ohlc: {}, summary: null, generating: true };

  // step 1: fetch summary (one call) and store (we will update price later)
  try {
    const summary = await fetchSummary(coinId);
    cache[key].summary = summary;
  } catch (e) {
    // proceed; summary may be filled later
    cache[key].summary = cache[key].summary || null;
  }

  // step 2: generate 24h (1d => use OHLC days=1 resampled to 24 points) synchronously to reply fast
  try {
    const r24 = RANGES.find(r => r.id === '1d');
    const pts = r24.points;
    const res = await generateImageForRange(symbol, coinId, '1d', pts);
    cache[key].images['1d'] = res.imageUrl;
    cache[key].ohlc['1d'] = res.closes;
  } catch (err) {
    // fallback: try 1h as default if 1d fails
    try {
      const r1h = RANGES.find(r => r.id === '1h');
      const res2 = await generateImageForRange(symbol, coinId, '1h', r1h.points);
      cache[key].images['1d'] = res2.imageUrl;
      cache[key].ohlc['1d'] = res2.closes;
    } catch (e) {
      // leave empty
      console.error(`cryptochart: error generating default 24h image for ${symbol}`, err || e);
    }
  }

  // background: generate all other ranges (with gentle delay to avoid hitting rate limits)
  (async () => {
    try {
      const others = RANGES.filter(r => r.id !== '1d'); // already generated 1d (default)
      for (const r of others) {
        // small delay between CoinGecko calls
        await new Promise(rn => setTimeout(rn, 450)); // 450ms between each coingecko request
        try {
          const res = await generateImageForRange(symbol, coinId, r.id, r.points);
          cache[key].images[r.id] = res.imageUrl;
          cache[key].ohlc[r.id] = res.closes;
        } catch (err) {
          console.warn(`cryptochart: error generating image for ${symbol} ${r.id}:`, err && err.message ? err.message : err);
        }
      }
    } finally {
      cache[key].generating = false;
      cache[key].ts = Date.now();
      // schedule cache invalidation after TTL
      setTimeout(() => {
        if (cache[key] && (Date.now() - cache[key].ts >= CACHE_TTL)) {
          delete cache[key];
        }
      }, CACHE_TTL + 1000);
    }
  })();

  return cache[key];
}

// build select menu row
function buildSelectRow(symbol) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`cryptochart_select:${symbol}`)
    .setPlaceholder('Selecciona un rango')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(RANGES.map(r => ({ label: r.label, value: r.id })));
  return [ new ActionRowBuilder().addComponents(menu) ];
}

// schedule disabling components for a message (10 minutes)
function scheduleDisableComponents(client, message) {
  try {
    if (!message || !message.id) return;
    // clear previous
    if (activeMessageTimeouts.has(message.id)) {
      clearTimeout(activeMessageTimeouts.get(message.id));
      activeMessageTimeouts.delete(message.id);
    }
    const timeoutId = setTimeout(async () => {
      try {
        await message.edit({ components: [] }).catch(()=>{});
      } catch {}
      activeMessageTimeouts.delete(message.id);
      // cache cleanup: optional - doesn't need to delete cache immediately (cache TTL handles it)
    }, CACHE_TTL);
    activeMessageTimeouts.set(message.id, timeoutId);
  } catch (e) { /* noop */ }
}

// build final embed using cached image and fresh summary if possible
async function buildEmbedForSymbolRange(symbol, coinId, rangeId) {
  const key = symbol.toLowerCase();
  const c = cache[key];
  const imageUrl = c?.images?.[rangeId] || c?.images?.['1d'] || null;
  let summary = c?.summary || null;

  // always try to refresh summary (light request) so price is fresh
  try {
    const fresh = await fetchSummary(coinId);
    summary = fresh || summary;
    // update cached summary snapshot (but keep images)
    if (c) { c.summary = summary; c.ts = Date.now(); }
  } catch (e) {
    // ignore, keep old summary if exist
  }

  const embed = buildEmbed(symbol, rangeId, imageUrl, summary);
  return { embed, imageUrl };
}

/* ===========================
   Module exports (commands)
   =========================== */
module.exports = {
  name: 'cryptochart',
  description: 'Muestra gráfica y métricas (rango desplegable).',
  category: 'Criptos',
  ejemplo: 'cryptochart btc',
  syntax: '!cryptochart <moneda>',

  data: new SlashCommandBuilder()
    .setName('cryptochart')
    .setDescription('Muestra gráfica de precio con rangos')
    .addStringOption(o => o.setName('moneda').setDescription('btc, eth, sol, bnb, xrp, doge (o id)').setRequired(true)),

  // PREFIJO
  async executeMessage(msg, args) {
    // cooldown
    const last = userCooldown.get(msg.author.id) || 0;
    const now = Date.now();
    if (now - last < COMMAND_COOLDOWN_MS) {
      const remain = Math.ceil((COMMAND_COOLDOWN_MS - (now - last)) / 1000);
      return msg.reply({ embeds: [ new EmbedBuilder().setTitle('Whoo! Vas muy rápido').setDescription(`Intenta de nuevo en ${remain}s`).setColor(COLORS.error) ] });
    }
    userCooldown.set(msg.author.id, now);

    const raw = (args[0] || '').toLowerCase();
    if (!raw) return msg.reply({ embeds: [ new EmbedBuilder().setTitle('Uso').setDescription('Ej: `!cryptochart btc`').setColor(COLORS.error) ] });

    const coinId = resolveCoinId(raw);
    if (!coinId) return msg.reply({ embeds: [ new EmbedBuilder().setTitle('Error').setDescription('Moneda no reconocida').setColor(COLORS.error) ] });

    // ensure cache/generate images (24h first)
    let c;
    try {
      c = await ensureCacheForSymbol(raw, coinId);
    } catch (err) {
      console.error('cryptochart ensureCache error:', err);
      return msg.reply({ embeds: [ new EmbedBuilder().setTitle('Error').setDescription('No pude obtener datos de CoinGecko.').setColor(COLORS.error) ] });
    }

    // build embed for default range (1d)
    try {
      const { embed } = await buildEmbedForSymbolRange(raw, coinId, '1d');
      const components = buildSelectRow(raw);
      const sent = await msg.channel.send({ embeds: [embed], components });
      // schedule disable after TTL
      scheduleDisableComponents(this.client || msg.client, sent);
      return sent;
    } catch (err) {
      console.error('cryptochart final send error:', err);
      return msg.reply({ embeds: [ new EmbedBuilder().setTitle('Error').setDescription('No pude generar la gráfica.') .setColor(COLORS.error) ] });
    }
  },

  // SLASH
  async executeInteraction(interaction) {
    // cooldown
    const last = userCooldown.get(interaction.user.id) || 0;
    const now = Date.now();
    if (now - last < COMMAND_COOLDOWN_MS) {
      const remain = Math.ceil((COMMAND_COOLDOWN_MS - (now - last)) / 1000);
      return interaction.reply({ embeds: [ new EmbedBuilder().setTitle('Whoo! Vas muy rápido').setDescription(`Intenta de nuevo en ${remain}s`).setColor(COLORS.error) ], ephemeral: true });
    }
    userCooldown.set(interaction.user.id, now);

    const raw = (interaction.options.getString('moneda') || '').toLowerCase();
    if (!raw) return interaction.reply({ embeds: [ new EmbedBuilder().setTitle('Uso').setDescription('Ej: `/cryptochart moneda:btc`').setColor(COLORS.error) ], ephemeral: true });

    const coinId = resolveCoinId(raw);
    if (!coinId) return interaction.reply({ embeds: [ new EmbedBuilder().setTitle('Error').setDescription('Moneda no reconocida').setColor(COLORS.error) ], ephemeral: true });

    await interaction.deferReply(); // avoid timeouts while generating 24h

    try {
      await ensureCacheForSymbol(raw, coinId);
      const { embed } = await buildEmbedForSymbolRange(raw, coinId, '1d');
      const components = buildSelectRow(raw);
      const reply = await interaction.editReply({ embeds: [embed], components });
      scheduleDisableComponents(this.client || interaction.client, reply);
    } catch (err) {
      console.error('cryptochart slash error:', err);
      return interaction.editReply({ embeds: [ new EmbedBuilder().setTitle('Error').setDescription('No pude generar la gráfica.') .setColor(COLORS.error) ] });
    }
  },

  // handle select menu interactions
  async handleInteraction(interaction) {
    if (!interaction.isStringSelectMenu()) return;
    const cid = interaction.customId || '';
    if (!cid.startsWith('cryptochart_select:')) return;

    // immediate UI response to avoid timeout
    await interaction.deferUpdate();

    const symbol = cid.split(':')[1];
    const rangeId = interaction.values[0];
    const coinId = resolveCoinId(symbol);

    // ensure cache exists (if not, attempt to create quickly)
    try {
      await ensureCacheForSymbol(symbol, coinId);
    } catch (e) {
      console.error('cryptochart select ensureCache error:', e);
    }

    // build embed (uses cached image if available; also updates summary)
    try {
      const { embed } = await buildEmbedForSymbolRange(symbol, coinId, rangeId);
      // keep same select menu (rebuild)
      const components = buildSelectRow(symbol);
      // update original message
      await interaction.editReply({ embeds: [embed], components });
    } catch (err) {
      console.error('cryptochart select error:', err);
      try {
        await interaction.editReply({ embeds: [ new EmbedBuilder().setTitle('Error').setDescription('No pude generar la gráfica para ese rango.') .setColor(COLORS.error) ], components: buildSelectRow(symbol) });
      } catch {}
    }
  }
};
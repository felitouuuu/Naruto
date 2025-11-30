const {
  EmbedBuilder,
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder
} = require('discord.js');

const fetch = (globalThis.fetch) ? globalThis.fetch : require('node-fetch');
const { COINS } = require('../utils/cryptoUtils');

const COLORS = { main: '#6A0DAD', error: '#ED4245' };
const QUICKCHART_CREATE = 'https://quickchart.io/chart/create';
const MAX_POINTS = 240;

// ---------------- Cache global + dedupe ----------------
const chartCache = new Map(); // key: coinId -> { data: { ranges, summary }, createdAt }
const inFlight = new Map();   // key: coinId -> Promise (dedupe)
const CACHE_TIME = 10 * 60 * 1000; // 10 minutos
const MAX_CACHE_SIZE = 150;

const MAX_CONCURRENT_EXTERNAL = 2;
let currentExternal = 0;

const RANGES = [
  { id: '1h', label: '1h' },
  { id: '24h', label: '24h' },
  { id: '7d', label: '7d' },
  { id: '30d', label: '30d' }
];

function money(n) { if (n === null || n === undefined) return 'N/A'; return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function percent(n) { if (n === null || n === undefined) return 'N/A'; return `${Number(n).toFixed(2)}%`; }
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function withExternalSlot(fn) {
  while (currentExternal >= MAX_CONCURRENT_EXTERNAL) await sleep(100);
  currentExternal++;
  try { return await fn(); } finally { currentExternal--; }
}

async function fetchWithRetry(url, opts = {}, maxAttempts = 4) {
  let attempt = 0;
  while (attempt < maxAttempts) {
    attempt++;
    let res;
    try { res = await withExternalSlot(() => fetch(url, opts)); } catch (err) {
      if (attempt >= maxAttempts) throw err;
      await sleep(Math.min(2 ** attempt, 8) * 1000 + Math.random() * 300);
      continue;
    }
    if (res.ok) return res;
    if (res.status === 429) {
      const ra = res.headers && typeof res.headers.get === 'function' ? res.headers.get('retry-after') : null;
      const waitSec = ra ? Number(ra) : Math.min(2 ** attempt, 8);
      await sleep((waitSec * 1000) + Math.random() * 300);
      continue;
    }
    throw new Error(`HTTP ${res.status}`);
  }
  throw new Error('Max retries');
}

async function createQuickChartUrl(labels, values, title, color = 'rgb(106,13,173)') {
  const cfg = {
    type: 'line',
    data: { labels, datasets: [{ label: title, data: values, fill: true, borderColor: color, backgroundColor: color, pointRadius: 0, tension: 0.12 }] },
    options: {
      plugins: { legend: { display: false }, title: { display: true, text: title, font: { size: 16 } } },
      scales: { x: { display: false }, y: { ticks: { callback: v => (typeof v === 'number') ? ('$' + Number(v).toLocaleString()) : v } } },
      elements: { line: { borderWidth: 2 } }
    }
  };
  const body = { chart: cfg, backgroundColor: 'transparent', width: 1200, height: 420 };
  const res = await fetchWithRetry(QUICKCHART_CREATE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`QuickChart ${res.status}`);
  const json = await res.json();
  return json.url || null;
}

function resolveCoinId(input) {
  if (!input) return null;
  const s = input.toLowerCase();
  return COINS[s] || s;
}

async function fetchMarketDataRaw(coinId, rangeId) {
  const now = Math.floor(Date.now() / 1000);
  if (rangeId === '1h') {
    const from = now - 3600;
    const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}/market_chart/range?vs_currency=usd&from=${from}&to=${now}`;
    const r = await fetchWithRetry(url);
    if (!r.ok) throw new Error(`CoinGecko ${r.status}`);
    const json = await r.json();
    if (!json.prices || !json.prices.length) return null;
    let prices = json.prices.map(p => ({ t: p[0], v: p[1] }));
    if (prices.length > MAX_POINTS) {
      const step = Math.ceil(prices.length / MAX_POINTS);
      prices = prices.filter((_, i) => i % step === 0);
    }
    return prices;
  }
  const r = RANGES.find(x => x.id === rangeId);
  const days = r && r.id === '24h' ? 1 : (r && r.id === '7d' ? 7 : (r && r.id === '30d' ? 30 : 1));
  const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}/market_chart?vs_currency=usd&days=${days}`;
  const resp = await fetchWithRetry(url);
  if (!resp.ok) throw new Error(`CoinGecko ${resp.status}`);
  const j = await resp.json();
  if (!j.prices || !j.prices.length) return null;
  let prices = j.prices.map(p => ({ t: p[0], v: p[1] }));
  if (prices.length > MAX_POINTS) {
    const step = Math.ceil(prices.length / MAX_POINTS);
    prices = prices.filter((_, i) => i % step === 0);
  }
  return prices;
}

async function fetchCoinSummary(coinId) {
  const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`;
  const r = await fetchWithRetry(url);
  if (!r.ok) throw new Error(`CoinGecko ${r.status}`);
  return r.json();
}

function buildEmbedBase(symbol, rangeId, lastPrice, changePct, summary) {
  const embed = new EmbedBuilder()
    .setTitle(`${symbol.toUpperCase()} — ${RANGES.find(r=>r.id===rangeId)?.label || rangeId}`)
    .setDescription(`Último: **${money(lastPrice)}** • Cambio: **${Number(changePct).toFixed(2)}%**`)
    .setColor(COLORS.main)
    .setTimestamp();

  if (summary && summary.market_data) {
    const md = summary.market_data;
    const marketCap = md.market_cap?.usd ?? null;
    const rank = summary.market_cap_rank ? `#${summary.market_cap_rank}` : 'N/A';
    const fdv = md.fully_diluted_valuation?.usd ?? null;
    const ath = md.ath?.usd ?? null;
    const athDate = md.ath_date?.usd ? new Date(md.ath_date.usd) : null;
    const atl = md.atl?.usd ?? null;
    const atlDate = md.atl_date?.usd ? new Date(md.atl_date.usd) : null;
    const ch1 = md.price_change_percentage_1h_in_currency?.usd ?? null;
    const ch24 = md.price_change_percentage_24h_in_currency?.usd ?? null;
    const ch7 = md.price_change_percentage_7d_in_currency?.usd ?? null;

    embed.addFields(
      { name: 'Market cap', value: marketCap ? `${money(marketCap)} (${rank})` : 'N/A', inline: true },
      { name: 'FDV', value: fdv ? money(fdv) : 'N/A', inline: true },
      { name: 'Price', value: money(md.current_price?.usd), inline: true },
      { name: 'Change 1h', value: ch1 !== null ? `${ch1 >= 0 ? '🔺' : '🔻'} ${percent(ch1)}` : 'N/A', inline: true },
      { name: 'Change 24h', value: ch24 !== null ? `${ch24 >= 0 ? '🔺' : '🔻'} ${percent(ch24)}` : 'N/A', inline: true },
      { name: 'Change 7d', value: ch7 !== null ? `${ch7 >= 0 ? '🔺' : '🔻'} ${percent(ch7)}` : 'N/A', inline: true },
      { name: 'ATH', value: ath ? `${money(ath)} (${athDate ? athDate.toLocaleDateString() : 'N/A'})` : 'N/A', inline: true },
      { name: 'ATL', value: atl ? `${money(atl)} (${atlDate ? atlDate.toLocaleDateString() : 'N/A'})` : 'N/A', inline: true }
    );

    if (summary.image?.large) embed.setThumbnail(summary.image.large);
    embed.setFooter({ text: `Data fetched from CoinGecko.com` });
  } else {
    embed.addFields({ name: 'Fuente', value: 'CoinGecko (resumen no disponible)', inline: true });
  }

  return embed;
}

function buildSelectMenu(symbol, placeholder = 'Selecciona rango') {
  const options = RANGES.map(r => ({ label: r.label, value: r.id, description: `Ver ${r.label}` }));
  const select = new StringSelectMenuBuilder()
    .setCustomId(`cryptochart_select:${symbol}`)
    .setPlaceholder(placeholder)
    .addOptions(...options)
    .setMinValues(1)
    .setMaxValues(1);
  return [ new ActionRowBuilder().addComponents(select) ];
}

// ---------------- getOrCreateChartData ----------------
async function getOrCreateChartData(coinId, symbol, forceRefresh = false) {
  const key = String(coinId).toLowerCase();
  const now = Date.now();

  const cached = chartCache.get(key);
  if (!forceRefresh && cached && (now - cached.createdAt) < CACHE_TIME) return cached.data;

  if (inFlight.has(key)) {
    try { return await inFlight.get(key); } catch { inFlight.delete(key); }
  }

  let cancelled = false;

  const p = (async () => {
    try {
      let summary = null;
      try { summary = await fetchCoinSummary(coinId); } catch {}

      const tasks = RANGES.map(async (r) => {
        if (cancelled) return null;
        try {
          const prices = await fetchMarketDataRaw(coinId, r.id);
          if (!prices || !prices.length) return null;
          const labels = prices.map(p => {
            const d = new Date(p.t);
            return `${d.toLocaleDateString('en-US')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
          });
          const values = prices.map(p => Number(p.v));
          const first = values[0];
          const last = values[values.length - 1];
          const changePct = first && first !== 0 ? ((last - first) / first * 100) : 0;
          const title = `${symbol.toUpperCase()} · ${money(last)} · ${Number(changePct).toFixed(2)}%`;
          const chartUrl = await createQuickChartUrl(labels, values.map(v => Number(v.toFixed(8))), title);
          return { rangeId: r.id, chartUrl, lastPrice: last, changePct };
        } catch { return null; }
      });

      const results = await Promise.all(tasks);
      const ranges = {};
      for (const res of results) if (res && res.rangeId) ranges[res.rangeId] = { chartUrl: res.chartUrl, lastPrice: res.lastPrice, changePct: res.changePct };

      const data = { ranges, summary };

      if (chartCache.size >= MAX_CACHE_SIZE) {
        const oldestKey = chartCache.keys().next().value;
        if (oldestKey) chartCache.delete(oldestKey);
      }
      chartCache.set(key, { data, createdAt: Date.now() });
      return data;
    } finally {
      inFlight.delete(key);
    }
  })();

  const timeout = new Promise(resolve => setTimeout(() => {
    cancelled = true;
    resolve(null);
  }, 60000));

  const pWithTimeout = Promise.race([p, timeout]);
  inFlight.set(key, pWithTimeout);

  const res = await pWithTimeout;
  if (!res) throw new Error("Timeout: CoinGecko tardó demasiado");
  return res;
}

// ---------------- helpers para embed ----------------
function buildEmbedFromChartData(symbol, coinId, rangeId, chartData) {
  const rangeData = chartData.ranges && chartData.ranges[rangeId];
  const last = rangeData ? rangeData.lastPrice : null;
  const changePct = rangeData ? rangeData.changePct : 0;
  const embed = buildEmbedBase(symbol, rangeId, last, changePct, chartData.summary);
  if (rangeData && rangeData.chartUrl) embed.setImage(rangeData.chartUrl);
  return embed;
}

// ---------------- Exported command ----------------
module.exports = {
  name: 'cryptochart',
  description: 'Muestra gráfica y métricas avanzadas de una moneda (con select de rango).',
  category: 'Criptos',
  ejemplo: 'cryptochart btc',
  syntax: '!cryptochart <moneda>',

  data: new SlashCommandBuilder()
    .setName('cryptochart')
    .setDescription('Muestra gráfica de precio con rangos y métricas')
    .addStringOption(opt => opt.setName('moneda').setDescription('btc, eth, sol, bnb, xrp, doge (o id)').setRequired(true)),

  async executeMessage(msg, args) { /* tu código actual de prefijo, ya funciona */ },

  async executeInteraction(interaction) { /* tu código actual de slash, ya funciona */ },

  async handleInteraction(interaction) { /* tu código actual de select menu, ya funciona */ }
};

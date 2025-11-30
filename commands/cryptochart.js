// commands/cryptochart.js
const {
  EmbedBuilder,
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} = require('discord.js');

const fetch = globalThis.fetch || require('node-fetch');
const { COINS } = require('../utils/cryptoUtils');

const QUICKCHART_CREATE = 'https://quickchart.io/chart/create';
const COLORS = { main: '#6A0DAD', darkBorder: '#3a0050', error: '#ED4245' };

const CACHE_TTL = 10 * 60 * 1000; // 10 minutos
const BG_DELAY_MS = 400; // delay entre peticiones en background para evitar 429
const COOLDOWN_MS = 10 * 1000; // cooldown por usuario (10s)

const TARGET_POINTS = {
  '1h': 60,
  '1d': 72,
  '7d': 84,
  '30d': 90,
  '180d': 144,
  '365d': 147 // 146 + 1 tal como pediste
};

const RANGES = [
  { id: '1h', label: 'Última hora' },
  { id: '1d', label: 'Último día' },
  { id: '7d', label: 'Última semana' },
  { id: '30d', label: 'Último mes' },
  { id: '180d', label: 'Últimos 180d' },
  { id: '365d', label: 'Último año' }
];

// caches: por coinId (ej: 'bitcoin' / 'btc')
const CACHE = new Map(); // coinId => { created, ohlc: {range: [...]}, images: {range: url}, summary, timeoutHandle }
const COOLDOWNS = new Map();

// ---------------- util ----------------
function money(n) { return n == null ? 'N/A' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function percent(n) { return n == null ? 'N/A' : `${Number(n).toFixed(2)}%`; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function resolveCoinId(input) {
  if (!input) return null;
  const s = input.toLowerCase();
  return COINS[s] || s;
}

// downsample uniforme para targetCount
function downsample(values, targetCount) {
  if (!Array.isArray(values) || values.length === 0) return [];
  if (values.length <= targetCount) return values.slice();
  const step = values.length / targetCount;
  const out = [];
  for (let i = 0; i < targetCount; i++) {
    const idx = Math.floor(i * step);
    out.push(values[idx]);
  }
  return out;
}

// crea chart en QuickChart (POST -> devuelve url corta)
async function createQuickChartUrl(labels, values, title) {
  // estilo: borde oscuro, borderWidth ≈ 8px y gridlines para facilitar lectura
  const cfg = {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: title,
        data: values,
        fill: true,
        borderColor: COLORS.darkBorder,
        backgroundColor: 'rgba(106,13,173,0.12)', // suavizado violeta
        pointRadius: 0,
        tension: 0.12,
        borderWidth: 8 // grosor pedido (aprox 0.2cm)
      }]
    },
    options: {
      plugins: {
        legend: { display: false },
        title: { display: true, text: title, font: { size: 16 } }
      },
      scales: {
        x: {
          display: false,
          grid: { display: false }
        },
        y: {
          ticks: {
            callback: function (v) { return (typeof v === 'number') ? ('$' + Number(v).toLocaleString()) : v; }
          },
          grid: {
            color: 'rgba(200,200,200,0.12)', // cuadrícula tenue
            lineWidth: 1
          }
        }
      },
      elements: { line: { borderJoinStyle: 'round' } }
    }
  };

  const body = {
    chart: cfg,
    backgroundColor: 'transparent',
    width: 1200,
    height: 420
  };

  const res = await fetch(QUICKCHART_CREATE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) throw new Error(`QuickChart ${res.status}`);
  const j = await res.json();
  return j.url || null;
}

// ---------------- CoinGecko fetchers ----------------
// Para 1h usamos market_chart/range (from..to)
// Para otros usamos OHLC endpoint: /coins/{id}/ohlc?vs_currency=usd&days=...
async function fetchMarketSeries(coinId, rangeId) {
  try {
    const now = Math.floor(Date.now() / 1000);

    if (rangeId === '1h') {
      const from = now - 3600;
      const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}/market_chart/range?vs_currency=usd&from=${from}&to=${now}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`CoinGecko ${r.status}`);
      const j = await r.json();
      if (!j.prices || !j.prices.length) return null;
      // j.prices = [[ms, price], ...]
      const arr = j.prices.map(p => ({ t: p[0], v: p[1] }));
      const target = TARGET_POINTS['1h'];
      return downsample(arr, target);
    }

    // map rangeId to OHLC days param
    let daysParam;
    if (rangeId === '1d') daysParam = 1;
    else if (rangeId === '7d') daysParam = 7;
    else if (rangeId === '30d') daysParam = 30;
    else if (rangeId === '180d') daysParam = 180;
    else if (rangeId === '365d') daysParam = 365;
    else daysParam = 30;

    // OHLC returns [[time, open, high, low, close], ...]
    const urlOhlc = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}/ohlc?vs_currency=usd&days=${daysParam}`;
    const r2 = await fetch(urlOhlc);
    if (!r2.ok) throw new Error(`CoinGecko ${r2.status}`);
    const j2 = await r2.json();
    if (!Array.isArray(j2) || j2.length === 0) return null;
    // use close value as price
    const arr2 = j2.map(p => ({ t: p[0], v: p[4] }));
    const target = TARGET_POINTS[rangeId] || Math.min(arr2.length, 120);
    return downsample(arr2, target);
  } catch (err) {
    throw err;
  }
}

async function fetchSummary(coinId) {
  const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`CoinGecko ${r.status}`);
  return r.json();
}

// fast fetch for price/marketcap (light)
async function fetchSimplePrice(coinId) {
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(coinId)}&vs_currencies=usd&include_market_cap=true&include_24hr_change=true&include_24hr_vol=true`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`CoinGecko ${r.status}`);
  return r.json();
}

// ---------------- cache helpers ----------------
function ensureCacheEntry(coinId) {
  if (!CACHE.has(coinId)) {
    const entry = { created: Date.now(), ohlc: {}, images: {}, summary: null, timeoutHandle: null };
    // schedule expiry
    entry.timeoutHandle = setTimeout(() => {
      CACHE.delete(coinId);
    }, CACHE_TTL);
    CACHE.set(coinId, entry);
  } else {
    // reset TTL
    const e = CACHE.get(coinId);
    clearTimeout(e.timeoutHandle);
    e.timeoutHandle = setTimeout(() => CACHE.delete(coinId), CACHE_TTL);
  }
  return CACHE.get(coinId);
}

// Background pregen (no await from caller)
async function pregenerateImagesBackground(coinId, symbol, rangesToBuild = ['1h','7d','30d','180d','365d']) {
  try {
    ensureCacheEntry(coinId);
    const entry = CACHE.get(coinId);

    // build sequentially to avoid 429
    for (const rangeId of rangesToBuild) {
      // skip if already exists
      if (entry.images[rangeId]) continue;
      try {
        await sleep(BG_DELAY_MS);
        const series = await fetchMarketSeries(coinId, rangeId);
        if (!series || series.length === 0) continue;

        const labels = series.map(p => {
          const d = new Date(p.t);
          return `${d.toLocaleDateString('en-US')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
        });
        const values = series.map(p => Number(p.v));
        const title = `${symbol.toUpperCase()} · ${money(values[values.length-1])} · ${percent(((values[values.length-1]-values[0])/values[0])*100)}`;

        const url = await createQuickChartUrl(labels, values, title).catch(e => { throw e; });
        if (url) entry.images[rangeId] = url;
      } catch (err) {
        // log and continue
        console.error(`cryptochart: error generating image for ${coinId} ${rangeId}:`, err.message || err);
        // on 429 we backoff extra
        if (String(err).includes('429')) await sleep(1500);
      }
    }
    // optionally refresh summary snapshot if missing
    if (!entry.summary) {
      try {
        entry.summary = await fetchSummary(coinId).catch(()=>null);
      } catch {}
    }
  } catch (e) {
    console.error('pregenerateImagesBackground failed:', e);
  }
}

// ---------------- build embed ----------------
async function buildEmbedForRange(symbol, coinId, rangeId, forceRefreshPrice = true) {
  // ensure cache entry exists
  ensureCacheEntry(coinId);
  const entry = CACHE.get(coinId);

  // if ohlc not present for range, fetch it (sync)
  if (!entry.ohlc[rangeId]) {
    const series = await fetchMarketSeries(coinId, rangeId);
    if (!series || series.length === 0) return null;
    entry.ohlc[rangeId] = series;
  }

  // if image not present for range, create it (sync)
  if (!entry.images[rangeId]) {
    // build image now (POST to QuickChart)
    const series = entry.ohlc[rangeId];
    const labels = series.map(p => {
      const d = new Date(p.t);
      return `${d.toLocaleDateString('en-US')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    });
    const values = series.map(p => Number(p.v));
    try {
      const title = `${symbol.toUpperCase()} · ${money(values[values.length-1])} · ${percent(((values[values.length-1]-values[0])/values[0])*100)}`;
      const url = await createQuickChartUrl(labels, values, title);
      if (url) entry.images[rangeId] = url;
    } catch (err) {
      throw err;
    }
  }

  // ensure we have a summary snapshot (if not, try to fetch once)
  if (!entry.summary) {
    try { entry.summary = await fetchSummary(coinId); } catch (e) { entry.summary = null; }
  }

  // fetch fresh price minimal (so price always fresh)
  let freshPrice = null;
  try {
    const simple = await fetchSimplePrice(coinId);
    if (simple && simple[coinId] && simple[coinId].usd != null) {
      freshPrice = { price: simple[coinId].usd, market_cap: simple[coinId].usd_market_cap ?? null, vol24: simple[coinId].usd_24h_vol ?? null, change24: simple[coinId].usd_24h_change ?? null };
    }
  } catch (e) {
    // ignore, will use cached summary if exists
  }

  // prepare embed using: image from cache, summary from entry.summary, price from freshPrice if exists
  const series = entry.ohlc[rangeId];
  const values = series.map(p => Number(p.v));
  const first = values[0];
  const last = values[values.length - 1];
  const changePctRange = first ? ((last - first) / first * 100) : 0;

  const embed = new EmbedBuilder()
    .setTitle(`${symbol.toUpperCase()} — ${RANGES.find(r=>r.id===rangeId)?.label || rangeId}`)
    .setDescription(`Último: **${money(freshPrice?.price ?? entry.summary?.market_data?.current_price?.usd ?? last)}**`)
    .setColor(COLORS.main)
    .setImage(entry.images[rangeId] || null)
    .setTimestamp();

  if (entry.summary?.market_data) {
    const md = entry.summary.market_data;
    // use freshPrice for current price/marketcap/vol if available
    const priceVal = freshPrice?.price ?? md.current_price?.usd;
    const marketCap = freshPrice?.market_cap ?? md.market_cap?.usd;
    const vol24 = freshPrice?.vol24 ?? md.total_volume?.usd;
    const ch1 = md.price_change_percentage_1h_in_currency?.usd ?? null;
    const ch24 = freshPrice?.change24 ?? md.price_change_percentage_24h_in_currency?.usd ?? null;
    const ch7 = md.price_change_percentage_7d_in_currency?.usd ?? null;
    const ath = md.ath?.usd ?? null;
    const atl = md.atl?.usd ?? null;

    embed.addFields(
      { name: 'Market cap', value: marketCap ? money(marketCap) : 'N/A', inline: true },
      { name: 'Price', value: priceVal ? money(priceVal) : 'N/A', inline: true },
      { name: 'Change 1h', value: ch1 != null ? `${ch1 >= 0 ? '🔺' : '🔻'} ${percent(ch1)}` : 'N/A', inline: true },
      { name: 'Change 24h', value: ch24 != null ? `${ch24 >= 0 ? '🔺' : '🔻'} ${percent(ch24)}` : 'N/A', inline: true },
      { name: 'Change 7d', value: ch7 != null ? `${ch7 >= 0 ? '🔺' : '🔻'} ${percent(ch7)}` : 'N/A', inline: true },
      { name: 'Volume 24h', value: vol24 ? money(vol24) : 'N/A', inline: true },
      { name: 'ATH', value: ath ? money(ath) : 'N/A', inline: true },
      { name: 'ATL', value: atl ? money(atl) : 'N/A', inline: true }
    );

    if (entry.summary.image?.large) embed.setThumbnail(entry.summary.image.large);
    embed.setFooter({ text: 'Data fetched from CoinGecko.com' });
  } else {
    // no summary available -> show minimal
    embed.addFields(
      { name: 'Fuente', value: 'CoinGecko (resumen no disponible)', inline: true },
      { name: 'Change rango', value: `${Number(changePctRange).toFixed(2)}%`, inline: true }
    );
  }

  return embed;
}

// ----------------- components (select menu) -----------------
function buildSelectMenu(symbol) {
  const options = RANGES.map(r => ({ label: r.label, value: r.id }));
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`cryptochart_select:${symbol}`)
    .setPlaceholder('Selecciona rango')
    .addOptions(options)
    .setMinValues(1)
    .setMaxValues(1);

  return [ new ActionRowBuilder().addComponents(menu) ];
}

// ---------------- cooldown ----------------
function checkCooldown(userId) {
  const now = Date.now();
  const last = COOLDOWNS.get(userId) || 0;
  if (now - last < COOLDOWN_MS) {
    return COOLDOWN_MS - (now - last);
  }
  COOLDOWNS.set(userId, now);
  return 0;
}

// ---------------- exports (comando) ----------------
module.exports = {
  name: 'cryptochart',
  description: 'Gráfica y métricas (1h,1d,7d,30d,180d,365d) (select menu).',
  category: 'Criptos',
  ejemplo: 'cryptochart btc',
  syntax: '!cryptochart <moneda>',

  data: new SlashCommandBuilder()
    .setName('cryptochart')
    .setDescription('Muestra gráfica con rangos y métricas')
    .addStringOption(opt => opt.setName('moneda').setDescription('btc, eth, sol, bnb, xrp, doge (o id)').setRequired(true)),

  // ------------------- message command -------------------
  async executeMessage(msg, args) {
    const waitLeft = checkCooldown(msg.author.id);
    if (waitLeft > 0) {
      const until = Math.floor((Date.now() + waitLeft) / 1000);
      return msg.reply({ embeds: [ new EmbedBuilder().setTitle('Vas muy rápido').setDescription(`Puedes usar esto <t:${until}:R>`).setColor(COLORS.error) ] });
    }

    const raw = (args[0] || '').toLowerCase();
    if (!raw) return msg.reply({ embeds: [ new EmbedBuilder().setTitle('Uso incorrecto').setDescription('Ej: `!cryptochart btc`').setColor(COLORS.error) ] });

    const coinId = resolveCoinId(raw);
    if (!coinId) return msg.reply({ embeds: [ new EmbedBuilder().setTitle('Moneda desconocida').setColor(COLORS.error) ] });

    // build initial 1d embed synchronously (fast OHLC)
    try {
      // ensure cache entry and immediate summary fetch
      ensureCacheEntry(coinId);
      const entry = CACHE.get(coinId);
      if (!entry.summary) {
        try { entry.summary = await fetchSummary(coinId); } catch {}
      }

      const embed = await buildEmbedForRange(raw, coinId, '1d');
      if (!embed) throw new Error('no-embed');

      // send message with select menu
      const components = buildSelectMenu(raw);
      const sent = await msg.channel.send({ embeds: [embed], components });

      // pregenerate other images in background (not await)
      (async () => {
        // ranges to pregenerate (exclude 1d)
        const toBuild = ['1h','7d','30d','180d','365d'];
        await pregenerateImagesBackground(coinId, raw, toBuild);
      })();

      // schedule component disable after CACHE_TTL (10min): edit message to remove components
      setTimeout(async () => {
        try { await sent.edit({ components: [] }).catch(()=>{}); } catch {}
      }, CACHE_TTL);

      return;
    } catch (err) {
      console.error('cryptochart error (msg):', err);
      return msg.channel.send({ embeds: [ new EmbedBuilder().setTitle('Error').setDescription('No pude generar la gráfica para esa moneda.').setColor(COLORS.error) ] });
    }
  },

  // ------------------- slash -------------------
  async executeInteraction(interaction) {
    const waitLeft = checkCooldown(interaction.user.id);
    if (waitLeft > 0) {
      const until = Math.floor((Date.now() + waitLeft) / 1000);
      return interaction.reply({ embeds: [ new EmbedBuilder().setTitle('Vas muy rápido').setDescription(`Puedes usar esto <t:${until}:R>`).setColor(COLORS.error) ], ephemeral: true });
    }

    const raw = (interaction.options.getString('moneda') || '').toLowerCase();
    if (!raw) return interaction.reply({ embeds: [ new EmbedBuilder().setTitle('Uso incorrecto').setDescription('Ej: `/cryptochart moneda:btc`').setColor(COLORS.error) ], ephemeral: true });

    const coinId = resolveCoinId(raw);
    if (!coinId) return interaction.reply({ embeds: [ new EmbedBuilder().setTitle('Moneda desconocida').setColor(COLORS.error) ], ephemeral: true });

    await interaction.deferReply(); // en caso se tarde un poco en generar 1d
    try {
      ensureCacheEntry(coinId);
      const entry = CACHE.get(coinId);
      if (!entry.summary) {
        try { entry.summary = await fetchSummary(coinId); } catch {}
      }

      const embed = await buildEmbedForRange(raw, coinId, '1d');
      if (!embed) throw new Error('no-embed');

      const components = buildSelectMenu(raw);
      const replyMsg = await interaction.editReply({ embeds: [embed], components });

      // background pregeneration
      (async () => {
        const toBuild = ['1h','7d','30d','180d','365d'];
        await pregenerateImagesBackground(coinId, raw, toBuild);
      })();

      // schedule component disable after CACHE_TTL
      setTimeout(async () => {
        try { await replyMsg.edit({ components: [] }).catch(()=>{}); } catch {}
      }, CACHE_TTL);

      return;
    } catch (err) {
      console.error('cryptochart error (slash):', err);
      return interaction.editReply({ embeds: [ new EmbedBuilder().setTitle('Error').setDescription('No pude generar la gráfica para esa moneda.').setColor(COLORS.error) ] }).catch(()=>{});
    }
  },

  // ------------------- select handler -------------------
  async handleInteraction(interaction) {
    if (!interaction.isStringSelectMenu()) return;
    if (!interaction.customId.startsWith('cryptochart_select:')) return;

    // avoid cooldown for selects (you requested)
    const symbol = interaction.customId.split(':')[1];
    const rangeId = (interaction.values && interaction.values[0]) || '1d';
    const coinId = resolveCoinId(symbol);

    // defer update quickly to avoid 3s timeout while we build embed from cache
    await interaction.deferUpdate();

    try {
      // build embed: should be fast because images are cached; summary price will be updated
      const embed = await buildEmbedForRange(symbol, coinId, rangeId);
      if (!embed) return interaction.followUp({ content: 'No pude generar la gráfica para ese rango.', ephemeral: true });

      // keep same select menu (so user can change again)
      const components = buildSelectMenu(symbol);
      // update original message
      await interaction.editReply({ embeds: [embed], components }).catch(async () => {
        // fallback to interaction.message.edit if editReply fails
        try { await interaction.message.edit({ embeds: [embed], components }).catch(()=>{}); } catch {}
      });

      return;
    } catch (err) {
      console.error('cryptochart select error:', err);
      try {
        await interaction.followUp({ content: 'Ocurrió un error al generar la gráfica.', ephemeral: true });
      } catch {}
    }
  }
};
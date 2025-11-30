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

// RANGOS solicitados por el usuario
const RANGES = [
  { id: '1d', label: 'Último día', days: 1 },
  { id: '7d', label: 'Últimos 7d', days: 7 },
  { id: '30d', label: 'Últimos 30d', days: 30 },
  { id: '120d', label: 'Últimos 4 meses', days: 120 },
  { id: '365d', label: 'Último año', days: 365 },
  { id: 'max', label: 'Total recorrido', days: 'max' }
];

const MAX_POINTS = 240;          // muestreo para no exceder tamaño
const IMAGES_CACHE_MS = 10 * 60 * 1000; // 10 minutos para cache de imágenes y snapshot inicial
const COMPONENTS_TTL_MS = 10 * 60 * 1000; // 10 minutos para desactivar componentes del mensaje
const USER_COOLDOWN_MS = 10 * 1000; // cooldown por usuario (10s)
const REQUEST_DELAY_MS = 450;      // delay secuencial entre llamadas (reduce probabilidad 429)
const MAX_RETRIES = 3;

const imagesCache = {}; // { symbol: { createdAt, images: {rangeId: url}, summarySnapshot } }
const userCooldown = {}; // { userId: timestamp }

// util formatting
function money(n){ return n==null ? 'N/A' : `$${Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`; }
function percent(n){ return n==null ? 'N/A' : `${Number(n).toFixed(2)}%`; }

function resolveCoinId(input){
  if(!input) return null;
  const s = input.toLowerCase();
  return COINS[s] || s;
}

function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

// fetch with retries + exponential backoff (handle 429)
async function fetchWithRetry(url, opts = {}, retries = MAX_RETRIES){
  let attempt = 0;
  while(true){
    attempt++;
    try {
      const res = await fetch(url, opts);
      if (res.status === 429) {
        if (attempt > retries) throw new Error(`Rate limited (429) after ${attempt} attempts`);
        // respect Retry-After header if present
        const ra = res.headers && (res.headers.get('retry-after') || res.headers.get('Retry-After'));
        const wait = ra ? Number(ra) * 1000 : Math.pow(2, attempt) * 500 + Math.random()*200;
        await sleep(wait);
        continue;
      }
      return res;
    } catch (err) {
      if (attempt > retries) throw err;
      await sleep(Math.pow(2, attempt) * 300 + Math.random()*200);
    }
  }
}

// create quickchart through POST create => returns image url
async function createQuickChartUrl(labels, values, title, color='rgb(106,13,173)'){
  const cfg = {
    type: 'line',
    data: { labels, datasets: [{ label: title, data: values, fill: true, borderColor: color, backgroundColor: color, pointRadius: 0, tension: 0.12 }]},
    options: {
      plugins: { legend: { display: false }, title: { display: true, text: title, font: { size: 16 } } },
      scales: { x: { display: false }, y: { ticks: { callback: v => typeof v === 'number' ? ('$' + Number(v).toLocaleString()) : v } } },
      elements: { line: { borderWidth: 2 } }
    }
  };

  const body = { chart: cfg, backgroundColor: 'transparent', width: 1200, height: 420 };
  const res = await fetchWithRetry(QUICKCHART_CREATE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) throw new Error(`QuickChart ${res.status}`);
  const j = await res.json();
  // j.url -> final render url
  return j.url || null;
}

// fetch market chart data from CoinGecko
async function fetchMarketData(coinId, daysParam){
  // coinGecko endpoints:
  // - for 1d we use days=1 (returns many points) or we can use range; to keep simple we use market_chart with days parameter
  const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}/market_chart?vs_currency=usd&days=${daysParam}`;
  const res = await fetchWithRetry(url);
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
  const json = await res.json();
  if (!json.prices || !json.prices.length) return null;
  let prices = json.prices.map(p => ({ t: p[0], v: p[1] }));
  if (prices.length > MAX_POINTS) {
    const step = Math.ceil(prices.length / MAX_POINTS);
    prices = prices.filter((_, i) => i % step === 0);
  }
  return prices;
}

// fetch coin summary (market_data)
async function fetchCoinSummary(coinId){
  const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`;
  const res = await fetchWithRetry(url);
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
  return await res.json();
}

// fetch quick current price & change (light call) — keep price fresh on range change
async function fetchSimplePrice(coinId){
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(coinId)}&vs_currencies=usd&include_24hr_change=true&include_last_updated_at=true`;
  const res = await fetchWithRetry(url);
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
  const json = await res.json();
  return json[coinId] || null;
}

// generate all images for a symbol (all RANGES), returns { images: {rangeId:url}, summarySnapshot }
async function generateAllImagesAndSnapshot(symbol, coinId){
  const images = {};
  let summarySnapshot = null;
  // fetch summary first (so we have ATH/ATL and other metrics)
  try {
    summarySnapshot = await fetchCoinSummary(coinId);
  } catch (err) {
    // keep null but continue
    summarySnapshot = null;
  }

  for (const r of RANGES) {
    try {
      const daysParam = r.id === 'max' ? 'max' : r.days;
      const prices = await fetchMarketData(coinId, daysParam);
      if (!prices || !prices.length) {
        images[r.id] = null;
      } else {
        const labels = prices.map(p => {
          const d = new Date(p.t);
          // compact label
          return `${d.getUTCMonth()+1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`;
        });
        const values = prices.map(p => Number(p.v));
        const first = values[0], last = values[values.length-1];
        const changePct = first && first !== 0 ? ((last-first)/first*100) : 0;
        const title = `${symbol.toUpperCase()} · ${money(last)} · ${Number(changePct).toFixed(2)}%`;
        // create chart (POST)
        const url = await createQuickChartUrl(labels, values.map(v => Number(v.toFixed(8))), title);
        images[r.id] = url;
      }
    } catch (err) {
      // if one range fails, log and continue; we'll mark null so later fallback to "no image"
      images[r.id] = null;
      // don't throw to allow generating other ranges
      console.error(`cryptochart: error generating image for ${symbol} ${r.id}:`, err?.message || err);
    }
    // small delay between CG requests to reduce 429 risk
    await sleep(REQUEST_DELAY_MS);
  }

  return { images, summarySnapshot };
}

// build select menu row (single select)
function buildSelectMenu(symbol){
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`cryptochart_select:${symbol}`)
    .setPlaceholder('Selecciona rango')
    .addOptions(RANGES.map(r => ({ label: r.label, value: r.id })))
    .setMinValues(1)
    .setMaxValues(1);
  return [ new ActionRowBuilder().addComponents(menu) ];
}

// build embed from cached image + fresh price (we'll update price using fetchSimplePrice)
async function buildEmbedFromCache(symbol, coinId, rangeId, cacheEntry){
  // image url from cache (may be null)
  const imgUrl = cacheEntry.images[rangeId] || null;

  // obtain fresh price & 24h change if possible
  let simple = null;
  try { simple = await fetchSimplePrice(coinId); } catch (e) { simple = null; }

  // Prefer fresh simple price for price field, otherwise fallback to snapshot summary
  let price = simple?.usd ?? cacheEntry?.summarySnapshot?.market_data?.current_price?.usd ?? null;
  let ch24 = simple?.usd_24h_change ?? cacheEntry?.summarySnapshot?.market_data?.price_change_percentage_24h ?? null;

  // Other metrics use snapshot (ATH/ATL/marketcap) from snapshot to avoid extra calls for each range change
  const snapshot = cacheEntry?.summarySnapshot;
  const md = snapshot?.market_data;

  const embed = new EmbedBuilder()
    .setTitle(`${symbol.toUpperCase()} — ${RANGES.find(r=>r.id===rangeId)?.label || rangeId}`)
    .setDescription(`Último: **${money(price)}** • Cambio 24h: **${ch24 !== null ? percent(ch24) : 'N/A'}**`)
    .setColor(COLORS.main)
    .setTimestamp();

  if (imgUrl) embed.setImage(imgUrl);

  if (md) {
    embed.addFields(
      { name: 'Market cap', value: md.market_cap?.usd ? money(md.market_cap.usd) : 'N/A', inline: true },
      { name: 'Price actual', value: md.current_price?.usd ? money(md.current_price.usd) : money(price), inline: true },
      { name: 'Change 1h / 24h / 7d', value:
        `${md.price_change_percentage_1h_in_currency?.usd !== undefined ? (md.price_change_percentage_1h_in_currency.usd >=0 ? '🔺' : '🔻') + ' ' + percent(md.price_change_percentage_1h_in_currency.usd) : 'N/A'}\n` +
        `${ch24 !== null ? (ch24 >= 0 ? '🔺' : '🔻') + ' ' + percent(ch24) : 'N/A'}\n` +
        `${md.price_change_percentage_7d_in_currency?.usd !== undefined ? (md.price_change_percentage_7d_in_currency.usd >=0 ? '🔺' : '🔻') + ' ' + percent(md.price_change_percentage_7d_in_currency.usd) : 'N/A'}`,
        inline: true
      },
      { name: 'ATH', value: md.ath?.usd ? money(md.ath.usd) : 'N/A', inline: true },
      { name: 'ATL', value: md.atl?.usd ? money(md.atl.usd) : 'N/A', inline: true }
    );
    if (snapshot.image?.large) embed.setThumbnail(snapshot.image.large);
    embed.setFooter({ text: 'Data fetched from CoinGecko.com' });
  } else {
    // minimal fields when no snapshot available
    embed.addFields(
      { name: 'Fuente', value: 'CoinGecko', inline: true },
      { name: 'Price actual', value: price ? money(price) : 'N/A', inline: true }
    );
  }
  return embed;
}

// check + set cooldown
function checkAndSetCooldown(userId){
  const now = Date.now();
  const last = userCooldown[userId] || 0;
  if (now - last < USER_COOLDOWN_MS) {
    return Math.ceil((USER_COOLDOWN_MS - (now - last)) / 1000);
  }
  userCooldown[userId] = now;
  return 0;
}

// Public module
module.exports = {
  name: 'cryptochart',
  description: 'Muestra gráfica y métricas avanzadas de una moneda (menú de rangos).',
  category: 'Criptos',
  ejemplo: 'cryptochart btc',
  syntax: '!cryptochart <moneda>',

  data: new SlashCommandBuilder()
    .setName('cryptochart')
    .setDescription('Muestra gráfica de precio con rangos y métricas')
    .addStringOption(opt => opt.setName('moneda').setDescription('btc, eth, sol, bnb, xrp, doge (o id)').setRequired(true)),

  // Mensaje (prefijo)
  async executeMessage(msg, args) {
    const cd = checkAndSetCooldown(msg.author.id);
    if (cd) {
      return msg.reply({ embeds: [ new EmbedBuilder().setTitle('Vas muy rápido').setDescription(`Intenta de nuevo en ${cd} segundos`).setColor(COLORS.error) ] });
    }

    const raw = (args[0] || '').toLowerCase();
    if (!raw) return msg.channel.send({ embeds: [ new EmbedBuilder().setTitle('Uso incorrecto').setDescription('Ej: `!cryptochart btc`').setColor(COLORS.error) ] });

    const coinId = resolveCoinId(raw);
    // reuse cache if valid
    let cacheEntry = imagesCache[raw];
    const now = Date.now();
    if (!cacheEntry || (now - (cacheEntry.createdAt || 0) > IMAGES_CACHE_MS)) {
      // generate all images and snapshot
      const loading = await msg.channel.send({ content: 'Generando gráficos y recopilando datos... Esto puede tardar unos segundos.' });
      try {
        const gen = await generateAllImagesAndSnapshot(raw, coinId);
        cacheEntry = { createdAt: Date.now(), images: gen.images, summarySnapshot: gen.summarySnapshot };
        imagesCache[raw] = cacheEntry;
      } catch (err) {
        console.error('cryptochart generateAllImages error:', err);
        await loading.edit({ content: null, embeds: [ new EmbedBuilder().setTitle('Error').setDescription('No pude generar las gráficas. Intenta más tarde.').setColor(COLORS.error) ] });
        return;
      }
      await loading.delete().catch(()=>{});
    }

    // Build embed for default range (1d)
    const defaultRange = '1d';
    const embed = await buildEmbedFromCache(raw, coinId, defaultRange, cacheEntry);
    const components = buildSelectMenu(raw);

    // send and set disable timer
    const sent = await msg.channel.send({ embeds: [embed], components });
    // schedule components removal after TTL
    setTimeout(async () => {
      try { await sent.edit({ components: [] }); }
      catch (e) {}
    }, COMPONENTS_TTL_MS);
  },

  // Slash
  async executeInteraction(interaction) {
    const cd = checkAndSetCooldown(interaction.user.id);
    if (cd) {
      return interaction.reply({ embeds: [ new EmbedBuilder().setTitle('Vas muy rápido').setDescription(`Intenta de nuevo en ${cd} segundos`).setColor(COLORS.error) ], ephemeral: true });
    }

    const raw = (interaction.options.getString('moneda') || '').toLowerCase();
    if (!raw) return interaction.reply({ embeds: [ new EmbedBuilder().setTitle('Uso incorrecto').setDescription('Ej: `/cryptochart moneda:btc`').setColor(COLORS.error) ], ephemeral: true });

    const coinId = resolveCoinId(raw);
    // ensure cache (generate if needed)
    let cacheEntry = imagesCache[raw];
    const now = Date.now();
    if (!cacheEntry || (now - (cacheEntry.createdAt || 0) > IMAGES_CACHE_MS)) {
      await interaction.deferReply({ ephemeral: false });
      try {
        const gen = await generateAllImagesAndSnapshot(raw, coinId);
        cacheEntry = { createdAt: Date.now(), images: gen.images, summarySnapshot: gen.summarySnapshot };
        imagesCache[raw] = cacheEntry;
      } catch (err) {
        console.error('cryptochart generateAllImages (slash) error:', err);
        return interaction.editReply({ embeds: [ new EmbedBuilder().setTitle('Error').setDescription('No pude generar las gráficas. Intenta más tarde.').setColor(COLORS.error) ], components: [] });
      }
    } else {
      // we still defer (so UI shows loading) then edit
      await interaction.deferReply({ ephemeral: false });
    }

    // Build embed default range (1d)
    const defaultRange = '1d';
    const embed = await buildEmbedFromCache(raw, coinId, defaultRange, cacheEntry);
    const components = buildSelectMenu(raw);

    const sent = await interaction.editReply({ embeds: [embed], components, fetchReply: true });
    // schedule components removal
    setTimeout(async () => {
      try { await sent.edit({ components: [] }); }
      catch (e) {}
    }, COMPONENTS_TTL_MS);
  },

  // handle select menu interactions
  async handleInteraction(interaction) {
    if (!interaction.isStringSelectMenu()) return;
    if (!interaction.customId.startsWith('cryptochart_select:')) return;

    // symbol from customId
    const symbol = interaction.customId.split(':')[1];
    const rangeId = interaction.values[0];
    const coinId = resolveCoinId(symbol);

    // If cache expired, regenerate images (but we still respond quickly)
    let cacheEntry = imagesCache[symbol];
    if (!cacheEntry || (Date.now() - (cacheEntry.createdAt || 0) > IMAGES_CACHE_MS)) {
      // deferUpdate (keeps interaction alive) and try to regen in background
      await interaction.deferUpdate();
      try {
        const gen = await generateAllImagesAndSnapshot(symbol, coinId);
        cacheEntry = { createdAt: Date.now(), images: gen.images, summarySnapshot: gen.summarySnapshot };
        imagesCache[symbol] = cacheEntry;
      } catch (err) {
        console.error('cryptochart regen on select error:', err);
        // try to respond with error message edit
        try { await interaction.message.edit({ content: 'No pude generar/recuperar las gráficas. Intenta más tarde.', embeds: [], components: [] }); } catch(e){}
        return;
      }
    } else {
      // acknowledge immediately
      await interaction.deferUpdate();
    }

    try {
      // build embed using cache image for selected range and fresh price
      const embed = await buildEmbedFromCache(symbol, coinId, rangeId, cacheEntry);
      const components = buildSelectMenu(symbol);
      // update original message
      await interaction.editReply?.({ embeds: [embed], components }).catch(async () => {
        // fallback: edit message directly
        try { await interaction.message.edit({ embeds: [embed], components }); } catch(e){}
      });
    } catch (err) {
      console.error('cryptochart select build/update error:', err);
      try { await interaction.message.edit({ content: 'Ocurrió un error al generar la vista.', embeds: [], components: [] }); } catch(e){}
    }
  }
};
// commands/cryptochart.js
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
const CACHE_TIME = 10 * 60 * 1000; // 10 minutos (ajustable)
const MAX_CACHE_SIZE = 150; // evitar crecimiento ilimitado

// Límite global de concurrencia para llamadas externas (CoinGecko/QuickChart)
const MAX_CONCURRENT_EXTERNAL = 2; // reducido para menor presión sobre APIs
let currentExternal = 0;

// --- RANGOS REDUCIDOS A 4 (se generarán 4 imágenes por ejecución) ---
const RANGES = [
  { id: '1h', label: '1h' },
  { id: '24h', label: '24h' },
  { id: '7d', label: '7d' },
  { id: '30d', label: '30d' }
];

function money(n) {
  if (n === null || n === undefined) return 'N/A';
  return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function percent(n) {
  if (n === null || n === undefined) return 'N/A';
  return `${Number(n).toFixed(2)}%`;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Control simple de concurrencia para llamadas externas
async function withExternalSlot(fn) {
  while (currentExternal >= MAX_CONCURRENT_EXTERNAL) {
    await sleep(100);
  }
  currentExternal++;
  try {
    return await fn();
  } finally {
    currentExternal--;
  }
}

// fetch con retry/backoff y respeto Retry-After
async function fetchWithRetry(url, opts = {}, maxAttempts = 4) {
  let attempt = 0;
  while (attempt < maxAttempts) {
    attempt++;
    let res;
    try {
      res = await withExternalSlot(() => fetch(url, opts));
    } catch (err) {
      if (attempt >= maxAttempts) throw err;
      const waitMs = Math.min(2 ** attempt, 8) * 1000 + Math.random() * 300;
      await sleep(waitMs);
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

// QuickChart POST -> url
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

// obtiene precios (range o days)
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

// ---------------- getOrCreateChartData (cache + dedupe + eviction + timeout) ----------------
async function getOrCreateChartData(coinId, symbol, forceRefresh = false) {
  const key = String(coinId).toLowerCase();
  const now = Date.now();

  // devolver cache si válida y no forzada
  const cached = chartCache.get(key);
  if (!forceRefresh && cached && (now - cached.createdAt) < CACHE_TIME) {
    return cached.data;
  }

  // si ya hay una regeneración en vuelo para esta moneda, esperarla (dedupe)
  if (inFlight.has(key)) {
    try {
      return await inFlight.get(key);
    } catch (e) {
      // si la promesa en vuelo falló o fue eliminada, continuar y generar de nuevo
      inFlight.delete(key);
    }
  }

  // crear promesa en vuelo (p)
  const p = (async () => {
    // traer summary (no abortar si falla)
    let summary = null;
    try { summary = await fetchCoinSummary(coinId); } catch (e) { summary = null; }

    // generar todas las ranges en paralelo (ahora 4 tareas)
    const tasks = RANGES.map(async (r) => {
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
      } catch (err) {
        console.error(`Error generando range ${r.id} para ${coinId}:`, err);
        return null;
      }
    });

    const results = await Promise.all(tasks);
    const ranges = {};
    for (const res of results) {
      if (res && res.rangeId) ranges[res.rangeId] = { chartUrl: res.chartUrl, lastPrice: res.lastPrice, changePct: res.changePct };
    }

    const data = { ranges, summary };

    // eviction simple: si la cache creció demasiado, eliminar la entrada más antigua
    if (chartCache.size >= MAX_CACHE_SIZE) {
      const oldestKey = chartCache.keys().next().value;
      if (oldestKey) chartCache.delete(oldestKey);
    }

    chartCache.set(key, { data, createdAt: Date.now() });
    return data;
  })();

  // Timeout de seguridad (20 seg máximo por moneda)
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Timeout: CoinGecko tardó demasiado")), 20000)
  );

  const pWithTimeout = Promise.race([p, timeout]);

  // registrar y asegurar limpieza siempre
  inFlight.set(key, pWithTimeout);
  pWithTimeout.finally(() => inFlight.delete(key));

  try {
    const res = await pWithTimeout;
    return res;
  } catch (e) {
    console.error("Error o timeout en chart:", e.message);
    throw e;
  }
}

// ---------------- helpers para construir embed desde chartData ----------------
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

  // Prefijo (mensaje)
  async executeMessage(msg, args) {
    const raw = (args[0] || '').toLowerCase();
    if (!raw) return msg.channel.send({ embeds: [ new EmbedBuilder().setTitle('Uso incorrecto').setDescription('Ej: `!cryptochart btc`').setColor(COLORS.error) ] });

    const coinId = resolveCoinId(raw);
    const symbol = raw;

    // enviar mensaje de carga visible en canal
    let loadingMsg = null;
    try {
      loadingMsg = await msg.channel.send('Generando tabla... Esto puede tardar unos segundos.');
    } catch (e) {
      loadingMsg = null;
    }

    try {
      // FORZAR regeneración cada vez que se ejecuta el comando
      const chartData = await getOrCreateChartData(coinId, symbol, true);
      if (!chartData) throw new Error('no-chart-data');

      const embed = buildEmbedFromChartData(symbol, coinId, '24h', chartData);
      const components = buildSelectMenu(symbol, 'Selecciona rango');

      if (loadingMsg) {
        try {
          await loadingMsg.edit({ content: null, embeds: [embed], components });
        } catch (e) {
          await msg.channel.send({ embeds: [embed], components }).catch(() => {});
        }
      } else {
        await msg.channel.send({ embeds: [embed], components }).catch(() => {});
      }

      // programar desactivación a los 10 minutos: quitar componentes y borrar cache
      const targetMsg = loadingMsg;
      if (targetMsg) {
        setTimeout(async () => {
          try { await targetMsg.edit({ components: [] }); } catch (e) {}
          try { chartCache.delete(String(coinId).toLowerCase()); } catch (e) {}
        }, CACHE_TIME);
      } else {
        setTimeout(() => { try { chartCache.delete(String(coinId).toLowerCase()); } catch (e) {} }, CACHE_TIME);
      }

      return;
    } catch (err) {
      console.error('cryptochart error (msg):', err);
      const errEmbed = new EmbedBuilder().setTitle('Error').setDescription('No pude generar la gráfica. Intenta de nuevo en unos segundos.').setColor(COLORS.error);
      if (loadingMsg) {
        try { await loadingMsg.edit({ content: null, embeds: [errEmbed], components: [] }); } catch (e) { try { await msg.channel.send({ embeds: [errEmbed] }); } catch {} }
      } else {
        try { await msg.channel.send({ embeds: [errEmbed] }); } catch {}
      }
      return;
    }
  },

  // Slash
  async executeInteraction(interaction) {
    const raw = (interaction.options.getString('moneda') || '').toLowerCase();
    if (!raw) return interaction.reply({ embeds: [ new EmbedBuilder().setTitle('Uso incorrecto').setDescription('Ej: `/cryptochart moneda:btc`').setColor(COLORS.error) ], ephemeral: true });

    const coinId = resolveCoinId(raw);
    const symbol = raw;

    // responder inmediatamente para indicar que se está generando (mensaje público)
    try {
      await interaction.reply({ content: 'Generando tabla... Esto puede tardar unos segundos.', ephemeral: false });
    } catch (e) {
      try { await interaction.deferReply({ ephemeral: false }); } catch {}
    }

    try {
      // FORZAR regeneración cada vez que se ejecuta el comando
      const chartData = await getOrCreateChartData(coinId, symbol, true);
      if (!chartData) throw new Error('no-chart-data');

      const embed = buildEmbedFromChartData(symbol, coinId, '24h', chartData);

      try {
        await interaction.editReply({ content: null, embeds: [embed], components: buildSelectMenu(symbol, 'Selecciona rango') });
      } catch (e) {
        try { await interaction.followUp({ embeds: [embed], components: buildSelectMenu(symbol, 'Selecciona rango') }); } catch {}
      }

      // programar desactivación a los 10 minutos: quitar componentes y borrar cache
      try {
        const sent = await interaction.fetchReply();
        setTimeout(async () => {
          try { await sent.edit({ components: [] }); } catch (e) {}
          try { chartCache.delete(String(coinId).toLowerCase()); } catch (e) {}
        }, CACHE_TIME);
      } catch (e) {
        setTimeout(() => { try { chartCache.delete(String(coinId).toLowerCase()); } catch (e) {} }, CACHE_TIME);
      }
    } catch (err) {
      console.error('cryptochart error (slash):', err);
      const errEmbed = new EmbedBuilder().setTitle('Error').setDescription('No pude generar la gráfica. Intenta de nuevo en unos segundos.').setColor(COLORS.error);
      try {
        await interaction.editReply({ content: null, embeds: [errEmbed], components: [] });
      } catch (e) {
        try { await interaction.followUp({ embeds: [errEmbed], ephemeral: true }); } catch {}
      }
    }
  },

  // Manejo select menu (deferUpdate + usar cache si existe)
  async handleInteraction(interaction) {
    if (!interaction.isStringSelectMenu()) return;
    const cid = interaction.customId || '';
    if (!cid.startsWith('cryptochart_select:')) return;

    const parts = cid.split(':');
    if (parts.length !== 2) return interaction.reply({ content: 'Formato inválido', ephemeral: true });

    const symbol = parts[1];
    const coinId = resolveCoinId(symbol);

    const values = interaction.values || [];
    if (!values.length) return interaction.reply({ content: 'Selecciona un rango válido.', ephemeral: true });
    const rangeId = values[0];

    try {
      await interaction.deferUpdate();
    } catch (e) {
      try { await interaction.reply({ content: 'No pude procesar la interacción en este momento.', ephemeral: true }); } catch {}
      return;
    }

    // intentar usar chartCache; si no existe o expiró, generar (no forzamos)
    const key = String(coinId).toLowerCase();
    let cached = chartCache.get(key);
    const now = Date.now();
    if (!cached || (now - cached.createdAt) >= CACHE_TIME) {
      try {
        const data = await getOrCreateChartData(coinId, symbol, false);
        cached = { data, createdAt: Date.now() };
        // getOrCreateChartData already sets chartCache
      } catch (e) {
        console.error('cryptochart select preload error:', e);
        const is429 = e && e.message && e.message.includes('429');
        const errEmbed = new EmbedBuilder().setTitle('Error').setDescription(is429 ? 'CoinGecko está limitando las peticiones. Intenta de nuevo en unos segundos.' : 'Ocurrió un error al generar la gráfica.').setColor(COLORS.error);
        try { return interaction.editReply({ embeds: [errEmbed], components: buildSelectMenu(symbol, 'Selecciona rango') }); } catch (ex) { try { return interaction.followUp({ content: 'Ocurrió un error al generar la gráfica.', ephemeral: true }); } catch {} }
        return;
      }
    }

    try {
      const chartObj = chartCache.get(key)?.data || cached.data || cached;
      const embed = buildEmbedFromChartData(symbol, coinId, rangeId, chartObj);
      const age = Date.now() - (chartCache.get(key)?.createdAt || Date.now());
      const components = (age < CACHE_TIME) ? buildSelectMenu(symbol, `Rango: ${RANGES.find(r => r.id === rangeId)?.label || rangeId}`) : [];
      try {
        return interaction.editReply({ embeds: [embed], components });
      } catch (e) {
        try { return interaction.update({ embeds: [embed], components }); } catch (ex) { console.error('Failed to edit/update:', ex); try { return interaction.followUp({ content: 'Gráfica generada, pero no pude actualizar el mensaje.', ephemeral: true }); } catch {} }
      }
    } catch (err) {
      console.error('cryptochart select error:', err);
      try { return interaction.editReply({ embeds: [ new EmbedBuilder().setTitle('Error').setDescription('Ocurrió un error al generar la gráfica.').setColor(COLORS.error) ], components: buildSelectMenu(symbol, 'Selecciona rango') }); } catch (e) { try { return interaction.followUp({ content: 'Ocurrió un error al generar la gráfica.', ephemeral: true }); } catch {} }
    }
  }
};

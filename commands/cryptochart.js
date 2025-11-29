// commands/cryptochart.js
const {
  EmbedBuilder,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

// fetch: usa global fetch si existe, sino intenta node-fetch (CommonJS)
let fetchLib = (globalThis && globalThis.fetch) ? globalThis.fetch : null;
if (!fetchLib) {
  try { fetchLib = require('node-fetch'); } catch(e) { fetchLib = null; }
}
if (!fetchLib) throw new Error('No fetch disponible. Instala node-fetch o usa Node 18+.');

const { COINS } = require('../utils/cryptoUtils');

const QUICKCHART_CREATE = 'https://quickchart.io/chart/create';
const COLORS = { main: '#6A0DAD', error: '#ED4245' };

// Rangos disponibles
const RANGES = [
  { id: '1h', label: '1h' },
  { id: '24h', label: '24h', days: 1 },
  { id: '7d', label: '7d', days: 7 },
  { id: '30d', label: '1m', days: 30 },
  { id: '6m', label: '6m', days: 180 },
  { id: 'ytd', label: 'YTD' }, // computado
  { id: '365d', label: '1y', days: 365 },
  { id: 'max', label: 'Max', days: 'max' }
];

const MAX_POINTS = 240;
const FETCH_TIMEOUT = 15000; // ms

function money(n) {
  if (n == null) return 'N/A';
  return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function percent(n) {
  if (n == null) return 'N/A';
  return `${Number(n).toFixed(2)}%`;
}
function withSign(n) {
  if (n == null) return 'N/A';
  return (n >= 0 ? '🔺' : '🔻') + ' ' + percent(n);
}

// wrapper fetch con timeout
async function fetchTimeout(url, opts = {}, timeout = FETCH_TIMEOUT) {
  const controller = new (globalThis.AbortController || (require('node-abort-controller')).AbortController)();
  opts.signal = controller.signal;
  const t = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetchLib(url, opts);
    clearTimeout(t);
    return res;
  } catch (err) {
    clearTimeout(t);
    throw err;
  }
}

// Resolve coin id desde simbolo/ID usando COINS mapa
function resolveCoinId(input) {
  if (!input) return null;
  const s = String(input).toLowerCase();
  return COINS[s] || s;
}

// Obtener precios desde CoinGecko (rangeId = '1h'|'24h'|'7d'|'30d'|'6m'|'ytd'|'365d'|'max')
async function fetchMarketData(coinId, rangeId) {
  // construye url
  const now = Math.floor(Date.now() / 1000);
  let url;
  if (rangeId === '1h') {
    const from = now - 3600;
    url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}/market_chart/range?vs_currency=usd&from=${from}&to=${now}`;
  } else {
    // days param
    let days;
    if (rangeId === 'max') days = 'max';
    else if (rangeId === 'ytd') {
      const start = new Date(new Date().getFullYear(), 0, 1).getTime();
      const daysCalc = Math.ceil((Date.now() - start) / (1000 * 60 * 60 * 24));
      days = daysCalc > 0 ? daysCalc : 1;
    } else {
      const item = RANGES.find(r => r.id === rangeId) || {};
      days = item.days || 1;
    }
    url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}/market_chart?vs_currency=usd&days=${days}`;
  }

  const res = await fetchTimeout(url, { headers: { Accept: 'application/json' } }, FETCH_TIMEOUT);
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
  const json = await res.json();
  if (!json.prices || !Array.isArray(json.prices) || json.prices.length === 0) return null;

  // Map y sample
  let prices = json.prices.map(p => ({ t: p[0], v: p[1] }));
  if (prices.length > MAX_POINTS) {
    const step = Math.ceil(prices.length / MAX_POINTS);
    prices = prices.filter((_, i) => i % step === 0);
  }
  return prices;
}

// Obtener resumen (market cap, changes, volume, images...) de CoinGecko
async function fetchCoinSummary(coinId) {
  const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`;
  const res = await fetchTimeout(url, { headers: { Accept: 'application/json' } }, FETCH_TIMEOUT);
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
  return res.json();
}

// Crea URL corta en QuickChart (POST /chart/create) y devuelve url
async function createQuickChartUrl(cfg) {
  const body = { chart: cfg, backgroundColor: 'transparent', width: 1200, height: 420 };
  const res = await fetchTimeout(QUICKCHART_CREATE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }, FETCH_TIMEOUT);
  if (!res.ok) throw new Error(`QuickChart ${res.status}`);
  const j = await res.json();
  // j.url es la url del chart (corta)
  return j.url || null;
}

// Construir configuración de chart (Chart.js) simple
function buildChartConfig(labels, values, color = 'rgb(106,13,173)', title = '') {
  return {
    type: 'line',
    data: { labels, datasets: [{ label: title, data: values, fill: true, backgroundColor: color, borderColor: color, pointRadius: 0, tension: 0.15 }] },
    options: {
      plugins: { legend: { display: false }, title: { display: Boolean(title), text: title } },
      scales: { x: { display: false }, y: { ticks: { callback: (v) => typeof v === 'number' ? ('$' + Number(v).toLocaleString()) : v } } },
      elements: { line: { borderWidth: 2 } }
    }
  };
}

// Generar embed con chart (usa QuickChart POST para no tener URL gigantes)
async function generateEmbedForRange(symbol, coinId, rangeId) {
  const prices = await fetchMarketData(coinId, rangeId);
  if (!prices || prices.length === 0) return null;

  let summary = null;
  try { summary = await fetchCoinSummary(coinId); } catch (e) { /* no fatal */ }

  // labels/values
  const labels = prices.map(p => {
    const d = new Date(p.t);
    return `${d.toLocaleDateString('en-US', { timeZone: 'America/New_York' })} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  });
  const values = prices.map(p => Number(p.v));
  const first = values[0];
  const last = values[values.length - 1];
  const changePct = first && first !== 0 ? ((last - first) / first * 100) : 0;

  // chart config + create
  const titleText = `${symbol.toUpperCase()} · ${money(last)} · ${changePct.toFixed(2)}%`;
  const cfg = buildChartConfig(labels, values.map(v => Number(v.toFixed(6))), 'rgba(106,13,173,0.9)', titleText);

  let chartUrl = null;
  try {
    chartUrl = await createQuickChartUrl(cfg);
  } catch (err) {
    // fallback: try inline encoded url but limit (last resort)
    try {
      const q = `${'https://quickchart.io/chart'}?c=${encodeURIComponent(JSON.stringify(cfg))}&backgroundColor=transparent&width=1200&height=420`;
      chartUrl = q;
    } catch (e) { chartUrl = null; }
  }

  const embed = new EmbedBuilder()
    .setTitle(`${symbol.toUpperCase()} — ${rangeId.toUpperCase()}`)
    .setDescription(`Último: **${money(last)}** • Cambio: **${changePct.toFixed(2)}%**`)
    .setColor(COLORS.main)
    .setTimestamp();

  if (chartUrl) embed.setImage(chartUrl);

  // Añadir métricas si existen
  if (summary && summary.market_data) {
    const md = summary.market_data;
    const marketCap = md.market_cap?.usd ?? null;
    const rank = summary.market_cap_rank ? `#${summary.market_cap_rank}` : 'N/A';
    const vol24 = md.total_volume?.usd ?? null;
    const fdv = md.fully_diluted_valuation?.usd ?? null;
    const ath = md.ath?.usd ?? null;
    const atl = md.atl?.usd ?? null;
    const ch1 = md.price_change_percentage_1h_in_currency?.usd ?? null;
    const ch24 = md.price_change_percentage_24h_in_currency?.usd ?? null;
    const ch7 = md.price_change_percentage_7d_in_currency?.usd ?? null;

    embed.addFields(
      { name: 'Market cap', value: marketCap ? `${money(marketCap)} (${rank})` : 'N/A', inline: true },
      { name: 'Volume 24h', value: vol24 ? money(vol24) : 'N/A', inline: true },
      { name: 'FDV', value: fdv ? money(fdv) : 'N/A', inline: true },
      { name: 'Price', value: money(md.current_price?.usd), inline: true },
      { name: 'Change 1h', value: ch1 !== null ? withSign(ch1) : 'N/A', inline: true },
      { name: 'Change 24h', value: ch24 !== null ? withSign(ch24) : 'N/A', inline: true },
      { name: 'Change 7d', value: ch7 !== null ? withSign(ch7) : 'N/A', inline: true },
      { name: 'ATH', value: ath ? `${money(ath)} (${new Date(md.ath_date?.usd || Date.now()).toLocaleDateString()})` : 'N/A', inline: true },
      { name: 'ATL', value: atl ? `${money(atl)} (${new Date(md.atl_date?.usd || Date.now()).toLocaleDateString()})` : 'N/A', inline: true }
    );
    if (summary.image?.large) embed.setThumbnail(summary.image.large);
    embed.setFooter({ text: 'Data fetched from CoinGecko.com' });
  } else {
    embed.addFields({ name: 'Fuente', value: 'CoinGecko', inline: true });
  }

  return embed;
}

// Construye fila de botones
function buildButtons(symbol) {
  const row = new ActionRowBuilder();
  for (const r of RANGES) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`cryptochart:${symbol}:${r.id}`)
        .setLabel(r.label)
        .setStyle(ButtonStyle.Primary)
    );
  }
  return row;
}

module.exports = {
  name: 'cryptochart',
  description: 'Muestra gráfica y métricas avanzadas de una moneda (con botones de rango).',
  category: 'Criptos',
  ejemplo: 'cryptochart btc',
  syntax: '!cryptochart <moneda>',

  data: new SlashCommandBuilder()
    .setName('cryptochart')
    .setDescription('Muestra gráfica de precio con rangos y métricas')
    .addStringOption(opt => opt.setName('moneda').setDescription('btc, eth, sol, bnb, xrp, doge (o id)').setRequired(true)),

  // Prefijo
  async executeMessage(msg, args) {
    const raw = (args[0] || '').toLowerCase();
    if (!raw) return msg.channel.send({ embeds: [ new EmbedBuilder().setTitle('Uso incorrecto').setDescription('Ej: `!cryptochart btc`').setColor(COLORS.error) ] });

    const coinId = resolveCoinId(raw);
    const symbol = raw;

    // validate coin existence quickly
    try {
      const res = await fetchTimeout(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}?localization=false`, { headers: { Accept: 'application/json' } });
      if (!res.ok) return msg.channel.send({ embeds: [ new EmbedBuilder().setTitle('Error').setDescription('Moneda no encontrada en CoinGecko.').setColor(COLORS.error) ] });
    } catch (e) {
      return msg.channel.send({ embeds: [ new EmbedBuilder().setTitle('Error').setDescription('No pude contactar CoinGecko.').setColor(COLORS.error) ] });
    }

    const loading = await msg.channel.send('Generando gráfica, espera por favor...');
    try {
      const embed = await generateEmbedForRange(symbol, coinId, '24h');
      if (!embed) throw new Error('no-embed');
      const components = [ buildButtons(symbol) ];
      await loading.edit({ content: null, embeds: [embed], components });
      return null;
    } catch (err) {
      console.error('cryptochart error (msg):', err);
      await loading.edit({ content: null, embeds: [ new EmbedBuilder().setTitle('Error').setDescription('No pude generar la gráfica para esa moneda.').setColor(COLORS.error) ] });
      return null;
    }
  },

  // Slash
  async executeInteraction(interaction) {
    const raw = (interaction.options.getString('moneda') || '').toLowerCase();
    if (!raw) return interaction.reply({ embeds: [ new EmbedBuilder().setTitle('Uso incorrecto').setDescription('Ej: `/cryptochart moneda:btc`').setColor(COLORS.error) ], ephemeral: true });

    const coinId = resolveCoinId(raw);
    const symbol = raw;

    // Defer reply porque puede tardar
    await interaction.deferReply({ ephemeral: false });

    try {
      const res = await fetchTimeout(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}?localization=false`, { headers: { Accept: 'application/json' } });
      if (!res.ok) return interaction.editReply({ embeds: [ new EmbedBuilder().setTitle('Error').setDescription('Moneda no encontrada en CoinGecko.').setColor(COLORS.error) ], ephemeral: true });
    } catch (e) {
      return interaction.editReply({ embeds: [ new EmbedBuilder().setTitle('Error').setDescription('No pude contactar CoinGecko.').setColor(COLORS.error) ], ephemeral: true });
    }

    try {
      const embed = await generateEmbedForRange(symbol, coinId, '24h');
      if (!embed) throw new Error('no-embed');
      return interaction.editReply({ embeds: [embed], components: [ buildButtons(symbol) ] });
    } catch (err) {
      console.error('cryptochart error (slash):', err);
      return interaction.editReply({ embeds: [ new EmbedBuilder().setTitle('Error').setDescription('No pude generar la gráfica para esa moneda.').setColor(COLORS.error) ] });
    }
  },

  // Manejo de botones
  async handleInteraction(interaction) {
    try {
      if (!interaction.isButton()) return;
      const cid = interaction.customId || '';
      if (!cid.startsWith('cryptochart:')) return;

      const parts = cid.split(':');
      if (parts.length !== 3) return interaction.reply({ content: 'Formato inválido', ephemeral: true });

      const symbol = parts[1];
      const rangeId = parts[2];
      const coinId = resolveCoinId(symbol);

      // Acknowledge quickly
      await interaction.deferUpdate();

      // generate and edit original message
      const embed = await generateEmbedForRange(symbol, coinId, rangeId);
      if (!embed) {
        try { await interaction.message.edit({ embeds: [ new EmbedBuilder().setTitle('Error').setDescription('No pude generar la gráfica para esa moneda/rango.').setColor(COLORS.error) ], components: [ buildButtons(symbol) ] }); }
        catch (e) {}
        return;
      }

      try {
        await interaction.message.edit({ embeds: [embed], components: [ buildButtons(symbol) ] });
      } catch (e) {
        // if edit fails, try reply as fallback
        try { await interaction.followUp({ embeds: [embed], ephemeral: true }); } catch (ee) {}
      }
    } catch (err) {
      console.error('cryptochart button error:', err);
      try { if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: 'Ocurrió un error generando la gráfica.', ephemeral: true }); } catch {}
    }
  }
};
// commands/cryptochart.js
const {
  EmbedBuilder,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

// fetch: usa global fetch si está, sino node-fetch
const fetch = (globalThis.fetch) ? globalThis.fetch : require('node-fetch');
const { COINS } = require('../utils/cryptoUtils');

const QUICKCHART_BASE = 'https://quickchart.io/chart';
const COLORS = { main: '#6A0DAD', error: '#ED4245' };

// Rangos soportados y mapping a parámetros de CoinGecko
const RANGES = [
  { id: '1h', label: 'Última hora' },      // usar range (from..to)
  { id: '24h', label: '24h', days: 1 },
  { id: '7d', label: '7d', days: 7 },
  { id: '30d', label: '30d', days: 30 },   // "1m"
  { id: '6m', label: '6m', days: 180 },
  { id: 'ytd', label: 'YTD' },             // calcula días desde inicio de año
  { id: '365d', label: '1 año', days: 365 },
  { id: 'max', label: 'Max', days: 'max' }
];

const MAX_POINTS = 240; // reducir puntos para no exceder URL

function fmtNumber(n, opts = {}) {
  if (n === null || typeof n === 'undefined') return 'N/A';
  const formatter = new Intl.NumberFormat('en-US', opts);
  return formatter.format(n);
}
function money(n) {
  if (n === null || typeof n === 'undefined') return 'N/A';
  return `$${fmtNumber(n, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function percent(n) {
  if (n === null || typeof n === 'undefined') return 'N/A';
  return `${Number(n).toFixed(2)}%`;
}

// Build QuickChart URL (encoded chart config)
function buildQuickChartUrl(labels, values, titleText, color = 'rgb(106,13,173)') {
  const cfg = {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: titleText,
          data: values,
          fill: true,
          borderColor: color,
          backgroundColor: color,
          pointRadius: 0,
          tension: 0.15
        }
      ]
    },
    options: {
      plugins: {
        legend: { display: false },
        title: { display: true, text: titleText, font: { size: 18 } }
      },
      scales: {
        x: { display: false },
        y: {
          ticks: { callback: function(v) { return typeof v === 'number' ? ('$' + Number(v).toLocaleString()) : v; } }
        }
      },
      elements: { line: { borderWidth: 2 } }
    }
  };

  const q = `${QUICKCHART_BASE}?c=${encodeURIComponent(JSON.stringify(cfg))}&backgroundColor=transparent&width=1200&height=420`;
  return q;
}

// Resolve coin id from symbol or id using COINS map
function resolveCoinId(input) {
  if (!input) return null;
  const s = input.toLowerCase();
  return COINS[s] || s;
}

// Fetch coin market chart data (prices) from CoinGecko
async function fetchMarketData(coinId, rangeId) {
  try {
    const now = Math.floor(Date.now() / 1000);

    if (rangeId === '1h') {
      // range endpoint required (from..to)
      const from = now - 3600;
      const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}/market_chart/range?vs_currency=usd&from=${from}&to=${now}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`CG ${res.status}`);
      const json = await res.json();
      if (!json.prices || !json.prices.length) return null;
      let prices = json.prices.map(p => ({ t: p[0], v: p[1] }));
      // sampling
      if (prices.length > MAX_POINTS) {
        const step = Math.ceil(prices.length / MAX_POINTS);
        prices = prices.filter((_, i) => i % step === 0);
      }
      return prices;
    }

    // days variants including 'max' and ytd
    let daysParam;
    if (rangeId === 'max') daysParam = 'max';
    else if (rangeId === 'ytd') {
      const start = new Date(new Date().getFullYear(), 0, 1);
      const days = Math.ceil((Date.now() - start.getTime()) / (1000 * 60 * 60 * 24));
      daysParam = days > 0 ? days : 1;
    } else {
      const r = RANGES.find(x => x.id === rangeId) || {};
      daysParam = r.days || 1;
    }

    const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}/market_chart?vs_currency=usd&days=${daysParam}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`CG ${res.status}`);
    const json = await res.json();
    if (!json.prices || !json.prices.length) return null;

    let prices = json.prices.map(p => ({ t: p[0], v: p[1] }));
    if (prices.length > MAX_POINTS) {
      const step = Math.ceil(prices.length / MAX_POINTS);
      prices = prices.filter((_, i) => i % step === 0);
    }
    return prices;
  } catch (err) {
    // bubble up
    throw err;
  }
}

// Fetch coin summary info (market cap, rank, changes, volume, FDV, ATH/ATL)
async function fetchCoinSummary(coinId) {
  const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
  const json = await res.json();
  return json;
}

// Build embed + chart for a given range
async function generateEmbedForRange(symbol, coinId, rangeId) {
  // get prices
  const prices = await fetchMarketData(coinId, rangeId);
  if (!prices || prices.length === 0) return null;

  // get summary (market metrics)
  let summary = null;
  try { summary = await fetchCoinSummary(coinId); } catch (e) { /* not fatal */ }

  const labels = prices.map(p => {
    const d = new Date(p.t);
    // show local times in America/New_York for consistency (if available)
    return `${d.toLocaleDateString('en-US', { timeZone: 'America/New_York' })} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  });
  const values = prices.map(p => Number(p.v));
  const first = values[0];
  const last = values[values.length - 1];
  const changePct = (first && first !== 0) ? ((last - first) / first * 100) : 0;

  // choose color & arrow emojis by 24h change if available
  const change24 = summary?.market_data?.price_change_percentage_24h ?? null;
  const arrow24 = change24 >= 0 ? '🔺' : '🔻';

  // Chart title and url
  const title = `${symbol.toUpperCase()} · $${Number(last).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · ${changePct.toFixed(2)}%`;
  const chartUrl = buildQuickChartUrl(labels, values.map(v => Number(v.toFixed(6))), title);

  // Build embed with many fields
  const embed = new EmbedBuilder()
    .setTitle(`${symbol.toUpperCase()} • ${rangeId.toUpperCase()}`)
    .setDescription(`**Price:** ${money(last)} • **Change(${rangeId})** ${Number(changePct).toFixed(2)}% ${Number(changePct) >= 0 ? '🟢' : '🔴'}`)
    .setColor(COLORS.main)
    .setImage(chartUrl)
    .setTimestamp();

  if (summary && summary.market_data) {
    const md = summary.market_data;
    const marketCap = md.market_cap?.usd ?? null;
    const rank = summary.market_cap_rank || summary.market_cap_rank === 0 ? `#${summary.market_cap_rank}` : 'N/A';
    const vol24 = md.total_volume?.usd ?? null;
    const fdv = md.fully_diluted_valuation?.usd ?? null;
    const ath = md.ath?.usd ?? null;
    const athDate = md.ath_date?.usd ? new Date(md.ath_date.usd) : null;
    const atl = md.atl?.usd ?? null;
    const atlDate = md.atl_date?.usd ? new Date(md.atl_date.usd) : null;
    const ch1 = md.price_change_percentage_1h_in_currency?.usd ?? null;
    const ch24 = md.price_change_percentage_24h_in_currency?.usd ?? null;
    const ch7 = md.price_change_percentage_7d_in_currency?.usd ?? null;

    // compact field block
    embed.addFields(
      { name: 'Market cap', value: marketCap ? `${money(marketCap)} (${rank})` : 'N/A', inline: true },
      { name: 'Volume 24h', value: vol24 ? money(vol24) : 'N/A', inline: true },
      { name: 'FDV', value: fdv ? money(fdv) : 'N/A', inline: true },
      { name: 'Price', value: money(md.current_price?.usd), inline: true },
      { name: 'Change 1h', value: ch1 !== null ? `${ch1 >= 0 ? '🔺' : '🔻'} ${percent(ch1)}` : 'N/A', inline: true },
      { name: 'Change 24h', value: ch24 !== null ? `${ch24 >= 0 ? '🔺' : '🔻'} ${percent(ch24)}` : 'N/A', inline: true },
      { name: 'Change 7d', value: ch7 !== null ? `${ch7 >= 0 ? '🔺' : '🔻'} ${percent(ch7)}` : 'N/A', inline: true },
      { name: 'ATH', value: ath ? `${money(ath)} (${athDate ? athDate.toLocaleDateString() : 'N/A'})` : 'N/A', inline: true },
      { name: 'ATL', value: atl ? `${money(atl)} (${atlDate ? atlDate.toLocaleDateString() : 'N/A'})` : 'N/A', inline: true }
    );

    if (summary.image?.large) embed.setThumbnail(summary.image.large);
    embed.setFooter({ text: 'Data fetched from CoinGecko.com' });
  } else {
    embed.addFields({ name: 'Fuente', value: 'CoinGecko (resumen no disponible)', inline: true });
  }

  return embed;
}

// Build row of buttons
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

  // --- Prefijo
  async executeMessage(msg, args) {
    const raw = (args[0] || '').toLowerCase();
    if (!raw) return msg.channel.send({ embeds: [ new EmbedBuilder().setTitle('Uso incorrecto').setDescription('Ej: `!cryptochart btc`').setColor(COLORS.error) ] });

    const coinId = resolveCoinId(raw);
    const symbol = raw;

    // validate coin existence
    try {
      const infoRes = await fetch(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}?localization=false`);
      if (!infoRes.ok) return msg.channel.send({ embeds: [ new EmbedBuilder().setTitle('Error').setDescription('Moneda no encontrada en CoinGecko.').setColor(COLORS.error) ] });
    } catch (e) {
      return msg.channel.send({ embeds: [ new EmbedBuilder().setTitle('Error').setDescription('No pude contactar CoinGecko.').setColor(COLORS.error) ] });
    }

    // default range 24h
    try {
      const embed = await generateEmbedForRange(symbol, coinId, '24h');
      if (!embed) throw new Error('no-embed');
      const components = [ buildButtons(symbol) ];
      return msg.channel.send({ embeds: [embed], components });
    } catch (err) {
      console.error('cryptochart error (msg):', err);
      return msg.channel.send({ embeds: [ new EmbedBuilder().setTitle('Error').setDescription('No pude generar la gráfica para esa moneda.').setColor(COLORS.error) ] });
    }
  },

  // --- Slash
  async executeInteraction(interaction) {
    const raw = (interaction.options.getString('moneda') || '').toLowerCase();
    if (!raw) return interaction.reply({ embeds: [ new EmbedBuilder().setTitle('Uso incorrecto').setDescription('Ej: `/cryptochart moneda:btc`').setColor(COLORS.error) ], ephemeral: true });

    const coinId = resolveCoinId(raw);
    const symbol = raw;

    try {
      const infoRes = await fetch(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}?localization=false`);
      if (!infoRes.ok) return interaction.reply({ embeds: [ new EmbedBuilder().setTitle('Error').setDescription('Moneda no encontrada en CoinGecko.').setColor(COLORS.error) ], ephemeral: true });
    } catch (e) {
      return interaction.reply({ embeds: [ new EmbedBuilder().setTitle('Error').setDescription('No pude contactar CoinGecko.').setColor(COLORS.error) ], ephemeral: true });
    }

    try {
      const embed = await generateEmbedForRange(symbol, coinId, '24h');
      if (!embed) throw new Error('no-embed');
      return interaction.reply({ embeds: [embed], components: [ buildButtons(symbol) ], ephemeral: false });
    } catch (err) {
      console.error('cryptochart error (slash):', err);
      return interaction.reply({ embeds: [ new EmbedBuilder().setTitle('Error').setDescription('No pude generar la gráfica para esa moneda.').setColor(COLORS.error) ], ephemeral: true });
    }
  },

  // --- Manejo de botones
  async handleInteraction(interaction) {
    if (!interaction.isButton()) return;
    const cid = interaction.customId || '';
    if (!cid.startsWith('cryptochart:')) return;

    const parts = cid.split(':');
    if (parts.length !== 3) return interaction.reply({ content: 'Formato inválido', ephemeral: true });

    const symbol = parts[1];
    const rangeId = parts[2];
    const coinId = resolveCoinId(symbol);

    try {
      const embed = await generateEmbedForRange(symbol, coinId, rangeId);
      if (!embed) return interaction.update({ embeds: [ new EmbedBuilder().setTitle('Error').setDescription('No pude generar la gráfica para esa moneda/rango.').setColor(COLORS.error) ] });

      // keep the same buttons (so user can change again)
      const components = [ buildButtons(symbol) ];
      return interaction.update({ embeds: [embed], components });
    } catch (err) {
      console.error('cryptochart button error:', err);
      try {
        return interaction.update({ embeds: [ new EmbedBuilder().setTitle('Error').setDescription('Ocurrió un error al generar la gráfica.').setColor(COLORS.error) ] });
      } catch (e) {
        return interaction.reply({ content: 'Error interno', ephemeral: true });
      }
    }
  }
};
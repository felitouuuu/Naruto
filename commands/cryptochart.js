// commands/cryptochart.js
const {
  EmbedBuilder,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const fetch = (globalThis.fetch) ? globalThis.fetch : require('node-fetch');
const { COINS } = require('../utils/cryptoUtils');

const COLORS = { main: '#6A0DAD', error: '#ED4245', up: '#2ECC71', down: '#ED4245' };
const QUICKCHART_CREATE = 'https://quickchart.io/chart/create';
const MAX_POINTS = 240;

// Rangos disponibles (id usados en customId)
const RANGES = [
  { id: '1h', label: '1h' },
  { id: '24h', label: '24h', days: 1 },
  { id: '7d', label: '7d', days: 7 },
  { id: '30d', label: '1m', days: 30 },
  { id: '6m', label: '6m', days: 180 },
  { id: 'ytd', label: 'YTD' },
  { id: '365d', label: '1y', days: 365 },
  { id: 'max', label: 'Max', days: 'max' }
];

function money(n) {
  if (n === null || typeof n === 'undefined' || Number.isNaN(n)) return 'N/A';
  return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function percent(n) {
  if (n === null || typeof n === 'undefined' || Number.isNaN(n)) return 'N/A';
  return `${Number(n).toFixed(2)}%`;
}
function colorFor(n) {
  return (typeof n === 'number' && n >= 0) ? COLORS.up : COLORS.down;
}

// convierte symbol/alias -> coinId usando COINS map
function resolveCoinId(input) {
  if (!input) return null;
  const s = input.toLowerCase();
  return COINS[s] || s;
}

// Construye configuración para QuickChart (Chart.js)
function buildChartConfig(labels, values, title, color = 'rgb(106,13,173)') {
  return {
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
        tension: 0.15
      }]
    },
    options: {
      plugins: {
        legend: { display: false },
        title: { display: true, text: title, font: { size: 18 } }
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
}

// Crea chart en QuickChart (POST /chart/create) y devuelve url
async function createQuickChartUrl(chartCfg) {
  try {
    const body = {
      chart: chartCfg,
      backgroundColor: 'transparent',
      width: 1200,
      height: 420,
      format: 'png'
    };
    const res = await fetch(QUICKCHART_CREATE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`QuickChart ${res.status}`);
    const json = await res.json();
    // json.url suele contener la URL al render
    return json.url || null;
  } catch (err) {
    throw err;
  }
}

// Obtener datos de mercado (precios series) desde CoinGecko
async function fetchMarketData(coinId, rangeId) {
  const now = Math.floor(Date.now() / 1000);
  // 1h: usar range endpoint with from..to
  if (rangeId === '1h') {
    const from = now - 3600;
    const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}/market_chart/range?vs_currency=usd&from=${from}&to=${now}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
    const json = await res.json();
    if (!json.prices || !Array.isArray(json.prices) || json.prices.length === 0) return null;
    let prices = json.prices.map(p => ({ t: p[0], v: p[1] }));
    if (prices.length > MAX_POINTS) {
      const step = Math.ceil(prices.length / MAX_POINTS);
      prices = prices.filter((_, i) => i % step === 0);
    }
    return prices;
  }

  // otros: calcular days param
  let daysParam;
  if (rangeId === 'max') daysParam = 'max';
  else if (rangeId === 'ytd') {
    const start = new Date(new Date().getFullYear(), 0, 1).getTime();
    const days = Math.ceil((Date.now() - start) / (1000 * 60 * 60 * 24));
    daysParam = Math.max(1, days);
  } else {
    const r = RANGES.find(x => x.id === rangeId);
    daysParam = (r && r.days) ? r.days : 1;
  }

  const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}/market_chart?vs_currency=usd&days=${daysParam}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
  const json = await res.json();
  if (!json.prices || !Array.isArray(json.prices) || json.prices.length === 0) return null;
  let prices = json.prices.map(p => ({ t: p[0], v: p[1] }));
  if (prices.length > MAX_POINTS) {
    const step = Math.ceil(prices.length / MAX_POINTS);
    prices = prices.filter((_, i) => i % step === 0);
  }
  return prices;
}

// Fetch coin summary (market cap, rank, etc.)
async function fetchCoinSummary(coinId) {
  const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
  return res.json();
}

// Construye filas de botones (máx 5 por fila). Devuelve array de ActionRowBuilder
function buildButtonRows(symbol) {
  const rows = [];
  let current = new ActionRowBuilder();
  let count = 0;

  for (const r of RANGES) {
    // crear botón
    const btn = new ButtonBuilder()
      .setCustomId(`cryptochart:${symbol}:${r.id}`)
      .setLabel(r.label)
      .setStyle(ButtonStyle.Primary);

    current.addComponents(btn);
    count++;

    if (count === 5) {
      rows.push(current);
      current = new ActionRowBuilder();
      count = 0;
    }
  }
  if (count > 0) rows.push(current);
  return rows;
}

// Genera embed (y crea chart en QuickChart) para coin+range
async function generateEmbedForRange(symbol, coinId, rangeId) {
  // obtener series
  const prices = await fetchMarketData(coinId, rangeId);
  if (!prices || prices.length === 0) return null;

  // obtener resumen (no obligatorio)
  let summary = null;
  try { summary = await fetchCoinSummary(coinId); } catch (e) { /* ok */ }

  // labels y values
  const labels = prices.map(p => {
    const d = new Date(p.t);
    // usar formato corto local
    return `${d.toLocaleDateString('en-US', { timeZone: 'America/New_York' })} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  });
  const values = prices.map(p => Number(p.v));
  const first = values[0];
  const last = values[values.length - 1];
  const changePct = (first && first !== 0) ? ((last - first) / first * 100) : 0;

  // color según cambio 24h (si summary tiene 24h)
  const change24 = summary?.market_data?.price_change_percentage_24h ?? changePct;
  const color = colorFor(change24);

  const title = `${symbol.toUpperCase()} · ${money(last)} · ${Number(changePct).toFixed(2)}%`;

  // chart config -> crear en quickchart
  const chartCfg = buildChartConfig(labels, values.map(v => Number(v.toFixed(6))), title, color);
  const chartUrl = await createQuickChartUrl(chartCfg).catch(err => {
    throw new Error('quickchart-failed:' + (err.message || err));
  });
  if (!chartUrl) throw new Error('quickchart-no-url');

  // armar embed con métricas
  const embed = new EmbedBuilder()
    .setTitle(`${symbol.toUpperCase()} • ${rangeId.toUpperCase()}`)
    .setDescription(`Último: **${money(last)}** • Cambio: **${Number(changePct).toFixed(2)}%** ${changePct >= 0 ? '🟢' : '🔴'}`)
    .setColor(COLORS.main)
    .setImage(chartUrl)
    .setTimestamp();

  if (summary && summary.market_data) {
    const md = summary.market_data;
    const marketCap = md.market_cap?.usd ?? null;
    const rank = summary.market_cap_rank || null;
    const vol24 = md.total_volume?.usd ?? null;
    const fdv = md.fully_diluted_valuation?.usd ?? null;
    const ath = md.ath?.usd ?? null;
    const athDate = summary?.ath_date?.usd ? new Date(summary.ath_date.usd) : null;
    const atl = md.atl?.usd ?? null;
    const ch1 = md.price_change_percentage_1h_in_currency?.usd ?? null;
    const ch24c = md.price_change_percentage_24h_in_currency?.usd ?? null;
    const ch7 = md.price_change_percentage_7d_in_currency?.usd ?? null;

    // añadir campos (compactos)
    embed.addFields(
      { name: 'Market cap', value: marketCap ? `${money(marketCap)} ${rank ? `(#${rank})` : ''}` : 'N/A', inline: true },
      { name: 'Volume 24h', value: vol24 ? money(vol24) : 'N/A', inline: true },
      { name: 'FDV', value: fdv ? money(fdv) : 'N/A', inline: true },
      { name: 'Price', value: money(md.current_price?.usd), inline: true },
      { name: 'Change 1h', value: (ch1 !== null) ? `${ch1 >= 0 ? '🔺' : '🔻'} ${percent(ch1)}` : 'N/A', inline: true },
      { name: 'Change 24h', value: (ch24c !== null) ? `${ch24c >= 0 ? '🔺' : '🔻'} ${percent(ch24c)}` : 'N/A', inline: true },
      { name: 'Change 7d', value: (ch7 !== null) ? `${ch7 >= 0 ? '🔺' : '🔻'} ${percent(ch7)}` : 'N/A', inline: true },
      { name: 'ATH', value: ath ? `${money(ath)}` : 'N/A', inline: true },
      { name: 'ATL', value: atl ? `${money(atl)}` : 'N/A', inline: true }
    );

    if (summary.image?.large) embed.setThumbnail(summary.image.large);
    embed.setFooter({ text: 'Data fetched from CoinGecko.com' });
  } else {
    embed.addFields({ name: 'Fuente', value: 'CoinGecko (resumen no disponible)', inline: true });
  }

  return embed;
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

    // validar existencia básica
    try {
      const infoRes = await fetch(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}?localization=false`);
      if (!infoRes.ok) return msg.channel.send({ embeds: [ new EmbedBuilder().setTitle('Error').setDescription('Moneda no encontrada en CoinGecko.').setColor(COLORS.error) ] });
    } catch (e) {
      return msg.channel.send({ embeds: [ new EmbedBuilder().setTitle('Error').setDescription('No pude contactar CoinGecko.').setColor(COLORS.error) ] });
    }

    // generar embed por defecto (24h)
    try {
      const embed = await generateEmbedForRange(symbol, coinId, '24h');
      if (!embed) throw new Error('no-embed');
      const components = buildButtonRows(symbol);
      return msg.channel.send({ embeds: [embed], components });
    } catch (err) {
      console.error('cryptochart error (msg):', err);
      return msg.channel.send({ embeds: [ new EmbedBuilder().setTitle('Error').setDescription('No pude generar la gráfica para esa moneda.').setColor(COLORS.error) ] });
    }
  },

  // Slash
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
      const components = buildButtonRows(symbol);
      return interaction.reply({ embeds: [embed], components, ephemeral: false });
    } catch (err) {
      console.error('cryptochart error (slash):', err);
      return interaction.reply({ embeds: [ new EmbedBuilder().setTitle('Error').setDescription('No pude generar la gráfica para esa moneda.').setColor(COLORS.error) ], ephemeral: true });
    }
  },

  // Manejo de botones
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

      const components = buildButtonRows(symbol);
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
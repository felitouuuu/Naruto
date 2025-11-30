// commands/cryptochart.js
const {
  EmbedBuilder,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

// fetch global o node-fetch fallback
const fetch = (globalThis.fetch) ? globalThis.fetch : require('node-fetch');
const { COINS } = require('../utils/cryptoUtils');

const COLORS = { main: '#6A0DAD', error: '#ED4245' };
const QUICKCHART_CREATE = 'https://quickchart.io/chart/create';
const MAX_POINTS = 240;

// RANGOS
const RANGES = [
  { id: '1h', label: 'Última hora' },
  { id: '24h', label: '24h' },
  { id: '7d', label: '7d' },
  { id: '30d', label: '30d' },
  { id: '6m', label: '6m' },
  { id: 'ytd', label: 'YTD' },
  { id: '365d', label: '1 año' },
  { id: 'max', label: 'Max' }
];

function money(n) {
  if (n === null || n === undefined) return 'N/A';
  return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function percent(n) {
  if (n === null || n === undefined) return 'N/A';
  return `${Number(n).toFixed(2)}%`;
}
function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

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
          ticks: {
            callback: v => ('$' + Number(v).toLocaleString())
          }
        }
      },
      elements: { line: { borderWidth: 2 } }
    }
  };

  const body = {
    chart: cfg,
    backgroundColor: 'transparent',
    width: 1200,
    height: 420,
    format: 'png' // 🔥 fuerza imagen PNG (evita crashes y URLs inválidas)
  };

  const res = await fetch(QUICKCHART_CREATE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) throw new Error(`QuickChart ${res.status}`);
  const json = await res.json();
  return json.url || null;
}

function resolveCoinId(input) {
  if (!input) return null;
  const s = input.toLowerCase();
  return COINS[s] || s;
}

async function fetchMarketData(coinId, rangeId) {
  const now = Math.floor(Date.now() / 1000);

  if (rangeId === '1h') {
    const from = now - 3600;
    const url = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart/range?vs_currency=usd&from=${from}&to=${now}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`CoinGecko ${r.status}`);
    const json = await r.json();
    if (!json.prices) return null;

    let prices = json.prices.map(p => ({ t: p[0], v: p[1] }));
    if (prices.length > MAX_POINTS) {
      const step = Math.ceil(prices.length / MAX_POINTS);
      prices = prices.filter((_, i) => i % step === 0);
    }
    return prices;
  }

  let days;
  if (rangeId === 'max') days = 'max';
  else if (rangeId === 'ytd') {
    const start = new Date(new Date().getFullYear(), 0, 1).getTime();
    days = Math.ceil((Date.now() - start) / (1000 * 60 * 60 * 24));
  } else days = {
    '24h': 1,
    '7d': 7,
    '30d': 30,
    '6m': 180,
    '365d': 365
  }[rangeId] || 1;

  const url = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=${days}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`CoinGecko ${r.status}`);

  const j = await r.json();
  if (!j.prices) return null;

  let prices = j.prices.map(p => ({ t: p[0], v: p[1] }));
  if (prices.length > MAX_POINTS) {
    const step = Math.ceil(prices.length / MAX_POINTS);
    prices = prices.filter((_, i) => i % step === 0);
  }
  return prices;
}

async function fetchCoinSummary(coinId) {
  const r = await fetch(
    `https://api.coingecko.com/api/v3/coins/${coinId}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`
  );
  if (!r.ok) throw new Error(`CoinGecko ${r.status}`);
  return r.json();
}

async function generateEmbedForRange(symbol, coinId, rangeId) {
  const prices = await fetchMarketData(coinId, rangeId);
  if (!prices) return null;

  let summary;
  try { summary = await fetchCoinSummary(coinId); }
  catch { summary = null; }

  const labels = prices.map(p => {
    const d = new Date(p.t);
    return `${d.toLocaleDateString('en-US')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  });
  const values = prices.map(p => Number(p.v));

  const first = values[0];
  const last = values[values.length - 1];
  const changePct = ((last - first) / first) * 100;

  const title = `${symbol.toUpperCase()} · ${money(last)} · ${changePct.toFixed(2)}%`;

  const chartUrl = await createQuickChartUrl(labels, values, title);

  const embed = new EmbedBuilder()
    .setTitle(`${symbol.toUpperCase()} — ${RANGES.find(r=>r.id===rangeId)?.label}`)
    .setDescription(`Último: **${money(last)}** • Cambio: **${changePct.toFixed(2)}%**`)
    .setColor(COLORS.main)
    .setImage(chartUrl)
    .setTimestamp();

  if (summary?.market_data) {
    const md = summary.market_data;

    embed.addFields(
      { name: 'Market cap', value: money(md.market_cap?.usd), inline: true },
      { name: 'Volume 24h', value: money(md.total_volume?.usd), inline: true },
      { name: 'FDV', value: money(md.fully_diluted_valuation?.usd), inline: true },
      { name: 'Price', value: money(md.current_price?.usd), inline: true },
      { name: 'Change 1h', value: percent(md.price_change_percentage_1h_in_currency?.usd), inline: true },
      { name: 'Change 24h', value: percent(md.price_change_percentage_24h_in_currency?.usd), inline: true },
      { name: 'Change 7d', value: percent(md.price_change_percentage_7d_in_currency?.usd), inline: true }
    );

    if (summary.image?.large) embed.setThumbnail(summary.image.large);
    embed.setFooter({ text: 'Data fetched from CoinGecko.com' });
  }

  return embed;
}

function buildButtons(symbol) {
  const btns = RANGES.map(r =>
    new ButtonBuilder()
      .setCustomId(`cryptochart:${symbol}:${r.id}`)
      .setLabel(r.label)
      .setStyle(ButtonStyle.Primary)
  );

  return chunkArray(btns, 5).map(chunk =>
    new ActionRowBuilder().addComponents(...chunk)
  );
}

module.exports = {
  name: 'cryptochart',
  description: 'Muestra gráfica y métricas avanzadas de una moneda.',
  category: 'Criptos',
  ejemplo: 'cryptochart btc',
  syntax: '!cryptochart <moneda>',

  data: new SlashCommandBuilder()
    .setName('cryptochart')
    .setDescription('Gráfica + métricas de una moneda')
    .addStringOption(opt =>
      opt.setName('moneda').setDescription('btc, eth, sol...').setRequired(true)
    ),

  async executeMessage(msg, args) {
    const raw = (args[0] || '').toLowerCase();
    if (!raw)
      return msg.channel.send({
        embeds: [new EmbedBuilder().setTitle('Uso incorrecto').setDescription('Ej: `!cryptochart btc`').setColor(COLORS.error)]
      });

    const coinId = resolveCoinId(raw);
    const symbol = raw;

    try {
      const test = await fetch(`https://api.coingecko.com/api/v3/coins/${coinId}`);
      if (!test.ok)
        return msg.channel.send({
          embeds: [new EmbedBuilder().setTitle('Error').setDescription('Moneda no encontrada.').setColor(COLORS.error)]
        });
    } catch {
      return msg.channel.send({
        embeds: [new EmbedBuilder().setTitle('Error').setDescription('CoinGecko no responde.').setColor(COLORS.error)]
      });
    }

    try {
      const embed = await generateEmbedForRange(symbol, coinId, '24h');
      const components = buildButtons(symbol);
      return msg.channel.send({ embeds: [embed], components });
    } catch (e) {
      console.error(e);
      return msg.channel.send({
        embeds: [new EmbedBuilder().setTitle('Error').setDescription('No pude generar la gráfica.').setColor(COLORS.error)]
      });
    }
  },

  async executeInteraction(interaction) {
    const raw = interaction.options.getString('moneda').toLowerCase();
    const coinId = resolveCoinId(raw);
    const symbol = raw;

    try {
      const test = await fetch(`https://api.coingecko.com/api/v3/coins/${coinId}`);
      if (!test.ok)
        return interaction.reply({
          embeds: [new EmbedBuilder().setTitle('Error').setDescription('Moneda no encontrada.').setColor(COLORS.error)],
          ephemeral: true
        });
    } catch {
      return interaction.reply({
        embeds: [new EmbedBuilder().setTitle('Error').setDescription('CoinGecko no responde.').setColor(COLORS.error)],
        ephemeral: true
      });
    }

    try {
      const embed = await generateEmbedForRange(symbol, coinId, '24h');
      const components = buildButtons(symbol);
      return interaction.reply({ embeds: [embed], components });
    } catch (e) {
      console.error(e);
      return interaction.reply({
        embeds: [new EmbedBuilder().setTitle('Error').setDescription('No pude generar la gráfica.').setColor(COLORS.error)],
        ephemeral: true
      });
    }
  },

  async handleInteraction(interaction) {
    if (!interaction.isButton()) return;
    const [prefix, symbol, range] = interaction.customId.split(':');
    if (prefix !== 'cryptochart') return;

    const coinId = resolveCoinId(symbol);

    try {
      const embed = await generateEmbedForRange(symbol, coinId, range);
      return interaction.update({ embeds: [embed], components: buildButtons(symbol) });
    } catch (e) {
      console.error(e);
      return interaction.update({
        embeds: [new EmbedBuilder().setTitle('Error').setDescription('Error al generar la gráfica.').setColor(COLORS.error)]
      });
    }
  }
};
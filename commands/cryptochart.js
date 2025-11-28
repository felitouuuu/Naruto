// commands/cryptochart.js
const { EmbedBuilder, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fetch = require('node-fetch');
const { COINS } = require('../utils/cryptoUtils');

const QUICKCHART_BASE = 'https://quickchart.io/chart';
const COLORS = { main: '#6A0DAD', error: '#ED4245' };

const RANGES = [
  { id: '1h', label: 'Última hora' },
  { id: '24h', label: 'Últimas 24h' },
  { id: '7d', label: 'Últimos 7d' },
  { id: '30d', label: 'Último mes' },
  { id: '365d', label: 'Último año' },
  { id: 'max', label: 'Max' }
];

function buildQuickChartUrl(labels, values, titleText) {
  const cfg = {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: titleText,
          data: values,
          fill: false,
          borderColor: 'rgb(106,13,173)',
          backgroundColor: 'rgb(106,13,173)',
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
          ticks: { callback: function(v){ return typeof v === 'number' ? ('$' + Number(v).toLocaleString()) : v } }
        }
      },
      elements: { line: { borderWidth: 2 } }
    }
  };

  const q = `${QUICKCHART_BASE}?c=${encodeURIComponent(JSON.stringify(cfg))}&backgroundColor=transparent&width=1200&height=420`;
  return q;
}

async function fetchMarketData(coinId, rangeId) {
  const now = Math.floor(Date.now() / 1000);
  let url;

  // 1 hour -> use range endpoint (from..to)
  if (rangeId === '1h') {
    const from = now - 3600;
    url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}/market_chart/range?vs_currency=usd&from=${from}&to=${now}`;
  } else if (rangeId === 'max') {
    url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}/market_chart?vs_currency=usd&days=max`;
  } else {
    // days: 1,7,30,365
    const days = rangeId === '24h' ? 1 : (rangeId === '7d' ? 7 : (rangeId === '30d' ? 30 : (rangeId === '365d' ? 365 : 1)));
    url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}/market_chart?vs_currency=usd&days=${days}`;
  }

  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
  const json = await res.json();
  // json.prices = [ [timestamp(ms), price], ... ]
  if (!json.prices || !Array.isArray(json.prices) || json.prices.length === 0) return null;

  // Map to arrays (sample to at most 240 points to keep chart small)
  let prices = json.prices.map(p => ({ t: p[0], v: p[1] }));
  const maxPoints = 240;
  if (prices.length > maxPoints) {
    const step = Math.ceil(prices.length / maxPoints);
    prices = prices.filter((_, i) => i % step === 0);
  }
  return prices;
}

function buildButtons(coinSymbol) {
  const row = new ActionRowBuilder();
  for (const r of RANGES) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`cryptochart:${coinSymbol}:${r.id}`)
        .setLabel(r.label)
        .setStyle(ButtonStyle.Primary)
    );
  }
  return row;
}

// Helper to get coinId from input (accepts symbol abbreviations or ids)
function resolveCoinId(input) {
  if (!input) return null;
  const s = input.toLowerCase();
  return COINS[s] || s;
}

async function generateEmbedForRange(coinSymbol, coinId, rangeId) {
  const prices = await fetchMarketData(coinId, rangeId);
  if (!prices || prices.length === 0) return null;

  const labels = prices.map(p => {
    // human label (time) - use short
    const d = new Date(p.t);
    return `${d.getUTCMonth()+1}/${d.getUTCDate()} ${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2,'0')}`;
  });
  const values = prices.map(p => Number(p.v.toFixed(6)));
  const last = values[values.length - 1];
  const first = values[0];
  const changePct = ((last - first) / first * 100).toFixed(2);

  const title = `${coinSymbol.toUpperCase()} · $${Number(last).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · ${changePct}%`;
  const chartUrl = buildQuickChartUrl(labels, values, title);

  const embed = new EmbedBuilder()
    .setTitle(`${coinSymbol.toUpperCase()} — Gráfica (${rangeId})`)
    .setDescription(`Último: **$${Number(last).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}** • Cambio: **${changePct}%**`)
    .setColor(COLORS.main)
    .setImage(chartUrl)
    .setTimestamp();

  return embed;
}

module.exports = {
  name: 'cryptochart',
  description: 'Muestra una gráfica de precio (con botones de rangos).',
  category: 'Criptos',
  ejemplo: 'cryptochart btc',
  syntax: '!cryptochart <moneda>',

  data: new SlashCommandBuilder()
    .setName('cryptochart')
    .setDescription('Muestra gráfica de precio con rangos (1h, 24h, 7d, 30d, 365d, max)')
    .addStringOption(opt => opt.setName('moneda').setDescription('btc, eth, sol, bnb, xrp, doge (o id)').setRequired(true)),

  // Prefijo
  async executeMessage(msg, args) {
    const raw = (args[0] || '').toLowerCase();
    if (!raw) return msg.channel.send({ embeds: [ new EmbedBuilder().setTitle('Uso incorrecto').setDescription('Ej: `!cryptochart btc`').setColor(COLORS.error) ] });

    const coinId = resolveCoinId(raw);
    const coinSymbol = raw;

    // validar existencia a nivel básico consultando coin info
    try {
      const infoRes = await fetch(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}?localization=false`);
      if (!infoRes.ok) return msg.channel.send({ embeds: [ new EmbedBuilder().setTitle('Error').setDescription('Moneda no encontrada en CoinGecko.').setColor(COLORS.error) ] });
    } catch (e) {
      return msg.channel.send({ embeds: [ new EmbedBuilder().setTitle('Error').setDescription('No pude contactar CoinGecko.').setColor(COLORS.error) ] });
    }

    // Generar embed para 24h por defecto
    let embed = await generateEmbedForRange(coinSymbol, coinId, '24h');
    if (!embed) return msg.channel.send({ embeds: [ new EmbedBuilder().setTitle('Error').setDescription('No pude generar la gráfica para esa moneda.').setColor(COLORS.error) ] });

    const components = [ buildButtons(coinSymbol) ];
    return msg.channel.send({ embeds: [embed], components });
  },

  // Slash
  async executeInteraction(interaction) {
    const raw = (interaction.options.getString('moneda') || '').toLowerCase();
    if (!raw) return interaction.reply({ embeds: [ new EmbedBuilder().setTitle('Uso incorrecto').setDescription('Ej: `/cryptochart moneda:btc`').setColor(COLORS.error) ], ephemeral: true });

    const coinId = resolveCoinId(raw);
    const coinSymbol = raw;

    try {
      const infoRes = await fetch(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}?localization=false`);
      if (!infoRes.ok) return interaction.reply({ embeds: [ new EmbedBuilder().setTitle('Error').setDescription('Moneda no encontrada en CoinGecko.').setColor(COLORS.error) ], ephemeral: true });
    } catch (e) {
      return interaction.reply({ embeds: [ new EmbedBuilder().setTitle('Error').setDescription('No pude contactar CoinGecko.').setColor(COLORS.error) ], ephemeral: true });
    }

    const embed = await generateEmbedForRange(coinSymbol, coinId, '24h');
    if (!embed) return interaction.reply({ embeds: [ new EmbedBuilder().setTitle('Error').setDescription('No pude generar la gráfica para esa moneda.').setColor(COLORS.error) ], ephemeral: true });

    return interaction.reply({ embeds: [embed], components: [ buildButtons(coinSymbol) ], ephemeral: false });
  },

  // Maneja clicks en botones (customId = cryptochart:<symbol>:<range>)
  async handleInteraction(interaction) {
    if (!interaction.isButton()) return;
    const cid = interaction.customId || '';
    if (!cid.startsWith('cryptochart:')) return;

    const parts = cid.split(':');
    // formato cryptochart:btc:1h
    if (parts.length !== 3) return interaction.reply({ content: 'Formato inválido', ephemeral: true });
    const coinSymbol = parts[1];
    const rangeId = parts[2];

    const coinId = resolveCoinId(coinSymbol);

    try {
      const embed = await generateEmbedForRange(coinSymbol, coinId, rangeId);
      if (!embed) return interaction.update({ embeds: [ new EmbedBuilder().setTitle('Error').setDescription('No pude generar la gráfica para esa moneda/rango.').setColor(COLORS.error) ] });

      // Actualizar mensaje (editamos embed)
      return interaction.update({ embeds: [embed] });
    } catch (err) {
      console.error('cryptochart button error:', err);
      return interaction.update({ embeds: [ new EmbedBuilder().setTitle('Error').setDescription('Ocurrió un error al generar la gráfica.').setColor(COLORS.error) ] });
    }
  }
};
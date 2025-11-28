// commands/cryptochart.js
const fetch = require('node-fetch');
const {
  EmbedBuilder,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const { COINS } = require('../utils/cryptoUtils');

const ERROR_COLOR = '#ED4245';
const SUCCESS_COLOR = '#6A0DAD';

const RANGE_MAP = {
  '1h': { days: '0.0416667', label: 'Última hora' },
  '24h': { days: '1', label: 'Últimas 24h' },
  '7d': { days: '7', label: 'Últimos 7 días' },
  '30d': { days: '30', label: 'Último mes' },
  '1y': { days: '365', label: 'Último año' },
  'max': { days: 'max', label: 'Max' }
};

function makeButtons(symbol, userId) {
  const row = new ActionRowBuilder();
  Object.keys(RANGE_MAP).forEach(k => {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`cryptochart|${symbol}|${k}|${userId}`)
        .setLabel(RANGE_MAP[k].label)
        .setStyle(ButtonStyle.Primary)
    );
  });
  return [row];
}

async function fetchMarketChart(id, days) {
  const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=${days}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
  const json = await res.json();
  if (!json.prices || !Array.isArray(json.prices) || json.prices.length === 0) return null;
  return json.prices; // array [ [timestamp, price], ... ]
}

function buildQuickChartUrl(labels, values, title) {
  const cfg = {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: title,
        data: values,
        fill: false,
        pointRadius: 0,
        borderWidth: 1.8
      }]
    },
    options: {
      scales: {
        x: { display: true, ticks: { maxRotation: 0, autoSkip: true } },
        y: { display: true }
      },
      plugins: { legend: { display: false } }
    }
  };
  const base = 'https://quickchart.io/chart';
  return `${base}?c=${encodeURIComponent(JSON.stringify(cfg))}&width=900&height=360&devicePixelRatio=1`;
}

function shortTime(ts, rangeKey) {
  const d = new Date(ts);
  if (rangeKey === '1h' || rangeKey === '24h') {
    return `${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;
  } else if (rangeKey === '7d' || rangeKey === '30d') {
    return `${d.getDate()}/${d.getMonth()+1}`;
  } else if (rangeKey === '1y' || rangeKey === 'max') {
    return `${d.getDate()}/${d.getMonth()+1}/${String(d.getFullYear()).slice(-2)}`;
  }
  return d.toISOString();
}

async function buildChartEmbed(symbol, id, rangeKey) {
  const range = RANGE_MAP[rangeKey];
  const prices = await fetchMarketChart(id, range.days);
  if (!prices) return null;

  // reduce points if too many
  const step = Math.max(1, Math.floor(prices.length / 300));
  const labels = [];
  const values = [];
  for (let i = 0; i < prices.length; i += step) {
    labels.push(shortTime(prices[i][0], rangeKey));
    values.push(Number(prices[i][1].toFixed(6)));
  }

  const imageUrl = buildQuickChartUrl(labels, values, `${symbol.toUpperCase()} ${range.label}`);
  const lastPrice = values[values.length - 1] ?? 0;
  const firstPrice = values[0] ?? lastPrice;
  const change = firstPrice ? (((lastPrice - firstPrice) / firstPrice) * 100).toFixed(2) : '0.00';

  const embed = new EmbedBuilder()
    .setTitle(`${symbol.toUpperCase()} — ${range.label}`)
    .setDescription(`Cambio en periodo: ${change}%`)
    .setImage(imageUrl)
    .addFields(
      { name: 'Precio actual (aprox)', value: `$${Number(lastPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, inline: true },
      { name: 'Periodo', value: range.label, inline: true },
      { name: 'Fuente', value: 'CoinGecko / QuickChart', inline: true }
    )
    .setColor(SUCCESS_COLOR)
    .setTimestamp();

  return embed;
}

module.exports = {
  name: 'cryptochart',
  description: 'Muestra una gráfica del histórico de precios con botones de rango.',
  category: 'Criptos',
  ejemplo: 'cryptochart btc',
  syntax: '<prefix> cryptochart <moneda>',
  data: new SlashCommandBuilder()
    .setName('cryptochart')
    .setDescription('Genera gráfico histórico de una moneda')
    .addStringOption(o => o.setName('moneda').setDescription('btc, eth, sol, bnb, xrp, doge').setRequired(true)),

  // PREFIX
  async executeMessage(msg, args) {
    const raw = (args[0] || '').toLowerCase();
    if (!raw) return msg.channel.send({ embeds: [new EmbedBuilder().setTitle('Uso incorrecto').setDescription('Ej: `!cryptochart btc`').setColor(ERROR_COLOR)] });

    const symbol = raw;
    // validar contra COINS o permitir id largo
    const id = (COINS[symbol] || symbol).toLowerCase();

    // comprobar que symbol es soportado por tu lista (evita valueset con monedas inventadas)
    const allowed = Object.values(COINS).concat(Object.keys(COINS));
    if (!allowed.includes(id) && !Object.keys(COINS).includes(symbol)) {
      return msg.channel.send({ embeds: [new EmbedBuilder().setTitle('Moneda no soportada').setDescription('Usa una moneda soportada.').setColor(ERROR_COLOR)] });
    }

    const userId = msg.author.id;
    let embed;
    try {
      embed = await buildChartEmbed(symbol, id, '24h');
      if (!embed) throw new Error('no data');
    } catch (err) {
      return msg.channel.send({ embeds: [new EmbedBuilder().setTitle('Error').setDescription('No pude generar la gráfica para esa moneda.').setColor(ERROR_COLOR)] });
    }

    const sent = await msg.channel.send({ embeds: [embed], components: makeButtons(symbol, userId) });

    // collector (solo quien ejecutó puede usar los botones)
    const col = sent.createMessageComponentCollector({ time: 120000 });
    col.on('collect', async i => {
      if (!i.customId.startsWith('cryptochart|')) return;
      const parts = i.customId.split('|'); // cryptochart|symbol|range|userId
      const [, s, rangeKey, allowedUser] = parts;
      if (i.user.id !== allowedUser) {
        return i.reply({ content: 'Solo el autor puede usar estos botones.', ephemeral: true });
      }
      try {
        const newEmbed = await buildChartEmbed(s, COINS[s] || s, rangeKey);
        if (!newEmbed) throw new Error('no data');
        await i.update({ embeds: [newEmbed], components: makeButtons(s, allowedUser) });
      } catch (err) {
        await i.update({ embeds: [new EmbedBuilder().setTitle('Error').setDescription('No pude generar la gráfica para esa moneda.').setColor(ERROR_COLOR)], components: makeButtons(s, allowedUser) });
      }
    });
  },

  // SLASH
  async executeInteraction(interaction) {
    const raw = (interaction.options.getString('moneda') || '').toLowerCase();
    if (!raw) return interaction.reply({ embeds: [new EmbedBuilder().setTitle('Uso incorrecto').setDescription('Ej: `/cryptochart moneda:btc`').setColor(ERROR_COLOR)], ephemeral: true });

    const symbol = raw;
    const id = (COINS[symbol] || symbol).toLowerCase();
    const allowed = Object.values(COINS).concat(Object.keys(COINS));
    if (!allowed.includes(id) && !Object.keys(COINS).includes(symbol)) {
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('Moneda no soportada').setDescription('Usa una moneda soportada.').setColor(ERROR_COLOR)], ephemeral: true });
    }

    const userId = interaction.user.id;
    let embed;
    try {
      embed = await buildChartEmbed(symbol, id, '24h');
      if (!embed) throw new Error('no data');
    } catch (err) {
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('Error').setDescription('No pude generar la gráfica para esa moneda.').setColor(ERROR_COLOR)], ephemeral: true });
    }

    const reply = await interaction.reply({ embeds: [embed], components: makeButtons(symbol, userId), fetchReply: true });

    const col = reply.createMessageComponentCollector({ time: 120000 });
    col.on('collect', async i => {
      if (!i.customId.startsWith('cryptochart|')) return;
      const parts = i.customId.split('|');
      const [, s, rangeKey, allowedUser] = parts;
      if (i.user.id !== allowedUser) return i.reply({ content: 'Solo el autor puede usar estos botones.', ephemeral: true });

      try {
        const newEmbed = await buildChartEmbed(s, COINS[s] || s, rangeKey);
        if (!newEmbed) throw new Error('no data');
        await i.update({ embeds: [newEmbed], components: makeButtons(s, allowedUser) });
      } catch (err) {
        await i.update({ embeds: [new EmbedBuilder().setTitle('Error').setDescription('No pude generar la gráfica para esa moneda.').setColor(ERROR_COLOR)], components: makeButtons(s, allowedUser) });
      }
    });
  }
};
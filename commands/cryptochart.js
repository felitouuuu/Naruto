// commands/cryptochart.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder } = require('discord.js');
const { COINS, getCryptoPrice } = require('../utils/cryptoUtils');
// usa global fetch (Node 18+). Si tu entorno requiere node-fetch, ajusta require.
const SUCCESS_COLOR = '#6A0DAD';
const ERROR_COLOR = '#ED4245';

const EMOJIS = {
  btc: '<:bitcoin:1442753420145725492>',
  eth: '<:eth:1442753368291283044>',
  sol: '<:solana:1442753317389467699>',
  bnb: '<:bnb:1442753271629615157>',
  xrp: '<:xrp:1442753138254680156>',
  doge: '<:dogecoin:1442753221717262336>'
};
const SUPPORTED = Object.keys(EMOJIS);

/**
 * RANGES mapping (label -> days for CoinGecko)
 * 1h -> fetch days=1 and slice last ~60 points
 */
const RANGES = [
  { id: '1h', label: 'Última hora', days: 1, slicePoints: 60 },
  { id: '24h', label: 'Últimas 24h', days: 1, slicePoints: null },
  { id: '7d', label: 'Últimos 7d', days: 7, slicePoints: null },
  { id: '1m', label: 'Último mes', days: 30, slicePoints: null },
  { id: '1y', label: 'Último año', days: 365, slicePoints: null },
  { id: 'max', label: 'Max', days: 'max', slicePoints: null }
];

function buildButtons() {
  const row = new ActionRowBuilder();
  for (const r of RANGES) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`cc_range_${r.id}`)
        .setLabel(r.label)
        .setStyle(ButtonStyle.Primary)
    );
  }
  return row;
}

function chooseRange(id) {
  return RANGES.find(r => r.id === id) || RANGES[1]; // default 24h
}

function formatShortLabel(ts) {
  const d = new Date(ts);
  return d.toLocaleString('en-US', { hour: 'numeric', minute: 'numeric', timeZone: 'America/New_York' });
}

async function fetchMarketChart(coinId, days) {
  const dParam = days === 'max' ? 'max' : String(days);
  const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}/market_chart?vs_currency=usd&days=${dParam}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
  return res.json(); // { prices: [[ts, price], ...], market_caps: ..., total_volumes: ... }
}

function buildQuickChartUrl(labels, data, title) {
  const cfg = {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: title,
          data,
          borderWidth: 1,
          fill: false,
          tension: 0.25,
          pointRadius: 0
        }
      ]
    },
    options: {
      scales: {
        x: { display: true, ticks: { maxRotation: 0, autoSkip: true } },
        y: { display: true }
      },
      plugins: {
        legend: { display: false },
        title: { display: false }
      }
    }
  };
  const base = 'https://quickchart.io/chart';
  return `${base}?c=${encodeURIComponent(JSON.stringify(cfg))}&width=1000&height=400&format=png&devicePixelRatio=2`;
}

function pickEmojiFor(idOrSymbol) {
  const symKey = Object.keys(COINS).find(k => COINS[k] === idOrSymbol) || idOrSymbol;
  return EMOJIS[symKey] || '💰';
}

module.exports = {
  name: 'cryptochart',
  description: 'Muestra gráfica histórica y estadísticas de una cripto (botones: 1h,24h,7d,1m,1y,max).',
  category: 'Criptos',
  ejemplo: 'cryptochart btc',
  syntax: '!cryptochart <moneda>',

  data: new SlashCommandBuilder()
    .setName('cryptochart')
    .setDescription('Gráfica histórica y métricas de una moneda')
    .addStringOption(opt => opt.setName('moneda').setDescription('btc, eth, sol, bnb, xrp, doge (o id)').setRequired(true)),

  // Prefix
  async executeMessage(msg, args) {
    const raw = (args[0] || '').toLowerCase();
    if (!raw) return msg.channel.send({ embeds: [new EmbedBuilder().setTitle('Uso incorrecto').setDescription('Ej: `!cryptochart btc`').setColor(ERROR_COLOR)] });

    const coinId = COINS[raw] || raw;
    try {
      // fetch current + chart default 24h
      const current = await getCryptoPrice(coinId);
      const range = chooseRange('24h');
      const chartData = await fetchMarketChart(coinId, range.days);

      // prepare labels and datapoints (may be many)
      let points = chartData.prices || [];
      if (range.slicePoints && points.length > range.slicePoints) points = points.slice(-range.slicePoints);
      const labels = points.map(p => formatShortLabel(p[0]));
      const values = points.map(p => Number(p[1].toFixed(6)));

      const title = `${raw.toUpperCase()} - ${range.label}`;
      const chartUrl = buildQuickChartUrl(labels, values, title);

      const emoji = pickEmojiFor(raw);
      const embed = new EmbedBuilder()
        .setTitle(`${emoji} ${raw.toUpperCase()} — $${Number(current.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`)
        .setColor(SUCCESS_COLOR)
        .setDescription(`Cambio 24h: ${(Number(current.change24h) || 0).toFixed(2)}%\nMarket cap rank: ${current.market_cap_rank || 'N/A'}`)
        .setImage(chartUrl)
        .setTimestamp();

      const message = await msg.channel.send({ embeds: [embed], components: [buildButtons()] });

      // collector para botones (30s)
      const collector = message.createMessageComponentCollector({ time: 60_000 });
      collector.on('collect', async i => {
        if (!i.isButton()) return;
        const id = i.customId.replace('cc_range_', '');
        const r = chooseRange(id);
        await i.deferUpdate();

        try {
          const newChartData = await fetchMarketChart(coinId, r.days);
          let pts = newChartData.prices || [];
          if (r.slicePoints && pts.length > r.slicePoints) pts = pts.slice(-r.slicePoints);
          const labels2 = pts.map(p => formatShortLabel(p[0]));
          const vals2 = pts.map(p => Number(p[1].toFixed(6)));
          const chartUrl2 = buildQuickChartUrl(labels2, vals2, `${raw.toUpperCase()} - ${r.label}`);

          const embed2 = EmbedBuilder.from(embed)
            .setImage(chartUrl2)
            .setFooter({ text: `Rango: ${r.label}` })
            .setTimestamp();

          await message.edit({ embeds: [embed2] });
        } catch (err) {
          console.error('chart update err', err);
        }
      });

      collector.on('end', () => {
        // disable buttons after end
        const disabledRow = new ActionRowBuilder();
        for (const r of RANGES) disabledRow.addComponents(
          new ButtonBuilder().setCustomId(`cc_range_${r.id}`).setLabel(r.label).setStyle(ButtonStyle.Secondary).setDisabled(true)
        );
        message.edit({ components: [disabledRow] }).catch(() => {});
      });

      return;
    } catch (err) {
      console.error('cryptochart err', err);
      return msg.channel.send({ embeds: [new EmbedBuilder().setTitle('Error').setDescription('No pude generar la gráfica para esa moneda.').setColor(ERROR_COLOR)] });
    }
  },

  // Slash
  async executeInteraction(interaction) {
    const raw = (interaction.options.getString('moneda') || '').toLowerCase();
    if (!raw) return interaction.reply({ embeds: [new EmbedBuilder().setTitle('Uso incorrecto').setDescription('Ej: `/cryptochart btc`').setColor(ERROR_COLOR)], ephemeral: true });

    const coinId = COINS[raw] || raw;
    await interaction.deferReply(); // porque vamos a tardar
    try {
      const current = await getCryptoPrice(coinId);
      const range = chooseRange('24h');
      const chartData = await fetchMarketChart(coinId, range.days);

      let points = chartData.prices || [];
      if (range.slicePoints && points.length > range.slicePoints) points = points.slice(-range.slicePoints);
      const labels = points.map(p => formatShortLabel(p[0]));
      const values = points.map(p => Number(p[1].toFixed(6)));

      const title = `${raw.toUpperCase()} - ${range.label}`;
      const chartUrl = buildQuickChartUrl(labels, values, title);

      const emoji = pickEmojiFor(raw);
      const embed = new EmbedBuilder()
        .setTitle(`${emoji} ${raw.toUpperCase()} — $${Number(current.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`)
        .setColor(SUCCESS_COLOR)
        .setDescription(`Cambio 24h: ${(Number(current.change24h) || 0).toFixed(2)}%\nMarket cap rank: ${current.market_cap_rank || 'N/A'}`)
        .setImage(chartUrl)
        .setTimestamp();

      const reply = await interaction.editReply({ embeds: [embed], components: [buildButtons()] });

      const collector = reply.createMessageComponentCollector({ time: 60_000 });
      collector.on('collect', async i => {
        if (!i.isButton()) return;
        const id = i.customId.replace('cc_range_', '');
        const r = chooseRange(id);
        await i.deferUpdate();

        try {
          const newChartData = await fetchMarketChart(coinId, r.days);
          let pts = newChartData.prices || [];
          if (r.slicePoints && pts.length > r.slicePoints) pts = pts.slice(-r.slicePoints);
          const labels2 = pts.map(p => formatShortLabel(p[0]));
          const vals2 = pts.map(p => Number(p[1].toFixed(6)));
          const chartUrl2 = buildQuickChartUrl(labels2, vals2, `${raw.toUpperCase()} - ${r.label}`);

          const embed2 = EmbedBuilder.from(embed)
            .setImage(chartUrl2)
            .setFooter({ text: `Rango: ${r.label}` })
            .setTimestamp();

          await reply.edit({ embeds: [embed2] });
        } catch (err) {
          console.error('chart update err', err);
        }
      });

      collector.on('end', () => {
        const disabledRow = new ActionRowBuilder();
        for (const r of RANGES) disabledRow.addComponents(
          new ButtonBuilder().setCustomId(`cc_range_${r.id}`).setLabel(r.label).setStyle(ButtonStyle.Secondary).setDisabled(true)
        );
        reply.edit({ components: [disabledRow] }).catch(() => {});
      });

      return;
    } catch (err) {
      console.error('cryptochart slash err', err);
      return interaction.editReply({ embeds: [new EmbedBuilder().setTitle('Error').setDescription('No pude generar la gráfica para esa moneda.').setColor(ERROR_COLOR)] });
    }
  }
};
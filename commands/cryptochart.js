// commands/cryptochart.js
const {
  EmbedBuilder,
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  AttachmentBuilder,
} = require('discord.js');

const fetch = globalThis.fetch || require('node-fetch');
const { COINS } = require('../utils/cryptoUtils');

// --- Render local de charts (Chart.js + node-canvas) ---
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');

const CHART_WIDTH = 1200;
const CHART_HEIGHT = 420;

const chartJSNodeCanvas = new ChartJSNodeCanvas({
  width: CHART_WIDTH,
  height: CHART_HEIGHT,
  backgroundColour: 'transparent',
});

const COLORS = { main: '#6A0DAD', darkBorder: '#3a0050', error: '#ED4245' };

const CACHE_TTL = 10 * 60 * 1000; // 10 minutos
const BG_DELAY_MS = 350;          // delay entre peticiones background
const COOLDOWN_MS = 10 * 1000;    // 10s
const MAX_RETRIES = 4;
const RETRY_BASE_MS = 500;

// TODOS los rangos usarán 24 puntos
const TARGET_POINTS = 24;

// rangos disponibles
const RANGES = [
  { id: '1h',   label: 'Última hora' },
  { id: '1d',   label: 'Último día' },
  { id: '7d',   label: 'Última semana' },
  { id: '30d',  label: 'Último mes' },
  { id: '90d',  label: 'Últimos 3 meses' },
  { id: '180d', label: 'Últimos 6 meses' },
  { id: '270d', label: 'Últimos 9 meses' },
  { id: '365d', label: 'Último año' },
];

// ===== helpers básicos =====
function money(n) {
  return n == null
    ? 'N/A'
    : '$' + Number(n).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
}
function percent(n) {
  return n == null ? 'N/A' : Number(n).toFixed(2) + '%';
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function resolveCoinId(input) {
  if (!input) return null;
  const s = input.toLowerCase();
  return COINS[s] || s;
}

// reintentos con backoff para CoinGecko
async function retryable(fn, attempts = MAX_RETRIES) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const str = String(err).toLowerCase();
      const status = err.status || 0;
      const backoff = RETRY_BASE_MS * Math.pow(2, i);

      // si es 429 no reintentamos (rate limit)
      if (status === 429 || str.includes('429')) {
        break;
      }

      // 5xx o errores de CoinGecko → reintento con backoff
      if ((status >= 500 && status < 600) || str.includes('coingecko')) {
        await sleep(backoff);
        continue;
      }
      break;
    }
  }
  throw lastErr;
}

// downsample uniforme a N puntos
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

// ====== RENDER LOCAL DEL GRÁFICO (Chart.js) ======
async function createChartBuffer(labels, values, title) {
  const configuration = {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: title,
          data: values,
          fill: true,
          borderColor: COLORS.darkBorder,
          backgroundColor: 'rgba(106,13,173,0.12)',
          pointRadius: 0,
          tension: 0.12,
          borderWidth: 8,
        },
      ],
    },
    options: {
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: title,
          font: { size: 16 },
        },
      },
      scales: {
        x: {
          display: false,
          grid: { display: false },
        },
        y: {
          ticks: {
            callback: (v) =>
              typeof v === 'number' ? '$' + Number(v).toLocaleString() : v,
          },
          grid: {
            color: 'rgba(200,200,200,0.12)',
            lineWidth: 1,
          },
        },
      },
      elements: {
        line: {
          borderJoinStyle: 'round',
        },
      },
    },
  };

  const buffer = await chartJSNodeCanvas.renderToBuffer(configuration);
  return buffer; // PNG buffer
}

// ===== CoinGecko: series de precios =====
async function fetchMarketSeries(coinId, rangeId) {
  return await retryable(async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const nowMs = Date.now();

    // --- 1h: market_chart/range (últimos 3600s) ---
    if (rangeId === '1h') {
      const from = nowSec - 3600;
      const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(
        coinId
      )}/market_chart/range?vs_currency=usd&from=${from}&to=${nowSec}`;

      const r = await fetch(url);
      if (!r.ok) {
        const e = new Error(`CoinGecko ${r.status}`);
        e.status = r.status;
        throw e;
      }

      const j = await r.json();
      if (!j.prices || !j.prices.length) return null;

      const arr = j.prices.map((p) => ({ t: p[0], v: p[1] }));
      return downsample(arr, TARGET_POINTS);
    }

    // --- resto de rangos: market_chart con days + interval ---
    let days = 30;
    let interval = 'daily';

    if (rangeId === '1d') {
      days = 1;
      interval = 'hourly';
    } else if (rangeId === '7d') {
      days = 7;
      interval = 'hourly';
    } else if (rangeId === '30d') {
      days = 30;
      interval = 'daily';
    } else if (rangeId === '90d') {
      days = 90;
      interval = 'daily';
    } else if (rangeId === '180d') {
      days = 180;
      interval = 'daily';
    } else if (rangeId === '270d' || rangeId === '365d') {
      days = 365;
      interval = 'daily';
    }

    const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(
      coinId
    )}/market_chart?vs_currency=usd&days=${days}&interval=${interval}`;

    const r2 = await fetch(url);
    if (!r2.ok) {
      const e = new Error(`CoinGecko ${r2.status}`);
      e.status = r2.status;
      throw e;
    }

    const j2 = await r2.json();
    if (!j2.prices || !j2.prices.length) return null;

    let arr = j2.prices.map((p) => ({ t: p[0], v: p[1] }));

    // para 9 meses: nos quedamos solo con últimos 270 días
    if (rangeId === '270d') {
      const cutoffMs = nowMs - 270 * 24 * 60 * 60 * 1000;
      arr = arr.filter((p) => p.t >= cutoffMs);
      if (!arr.length) return null;
    }

    return downsample(arr, TARGET_POINTS);
  });
}

async function fetchSummary(coinId) {
  return await retryable(async () => {
    const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(
      coinId
    )}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`;
    const r = await fetch(url);
    if (!r.ok) {
      const e = new Error(`CoinGecko ${r.status}`);
      e.status = r.status;
      throw e;
    }
    return r.json();
  });
}

async function fetchSimplePrice(coinId) {
  return await retryable(async () => {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(
      coinId
    )}&vs_currencies=usd&include_market_cap=true&include_24hr_change=true&include_24hr_vol=true`;
    const r = await fetch(url);
    if (!r.ok) {
      const e = new Error(`CoinGecko ${r.status}`);
      e.status = r.status;
      throw e;
    }
    return r.json();
  });
}

// ===== cache en memoria =====
// coinId => { created, ohlc:{range:series[]}, images:{range:buffer}, summary, timeoutHandle }
const CACHE = new Map();

function ensureCacheEntry(coinId) {
  if (!CACHE.has(coinId)) {
    const entry = {
      created: Date.now(),
      ohlc: {},
      images: {},
      summary: null,
      timeoutHandle: null,
    };
    entry.timeoutHandle = setTimeout(() => {
      CACHE.delete(coinId);
    }, CACHE_TTL);
    CACHE.set(coinId, entry);
  } else {
    const e = CACHE.get(coinId);
    clearTimeout(e.timeoutHandle);
    e.timeoutHandle = setTimeout(() => {
      CACHE.delete(coinId);
    }, CACHE_TTL);
  }
  return CACHE.get(coinId);
}

// Pre-genera imágenes en background (solo rangos cortos para evitar 429)
async function pregenerateImagesBackground(
  coinId,
  symbol,
  rangesToBuild = ['1h', '1d', '7d', '30d']
) {
  try {
    ensureCacheEntry(coinId);
    const entry = CACHE.get(coinId);

    for (const rangeId of rangesToBuild) {
      if (entry.images[rangeId]) continue;
      try {
        await sleep(BG_DELAY_MS);

        const series = await fetchMarketSeries(coinId, rangeId);
        if (!series || !series.length) continue;

        const labels = series.map((p) => {
          const d = new Date(p.t);
          return (
            d.toLocaleDateString('en-US') +
            ' ' +
            String(d.getHours()).padStart(2, '0') +
            ':' +
            String(d.getMinutes()).padStart(2, '0')
          );
        });
        const values = series.map((p) => Number(p.v));
        const first = values[0];
        const last = values[values.length - 1];
        const changePct =
          first && first !== 0 ? ((last - first) / first) * 100 : 0;

        const title = `${symbol.toUpperCase()} · ${money(
          last
        )} · ${percent(changePct)}`;
        const buffer = await createChartBuffer(labels, values, title);

        entry.ohlc[rangeId] = series;
        entry.images[rangeId] = buffer;
      } catch (err) {
        console.error(
          `cryptochart: error generating image for ${coinId} ${rangeId}:`,
          err.message || err
        );
        if (String(err).includes('429')) {
          // CoinGecko nos rate-limit, paramos
          break;
        }
      }
    }

    if (!entry.summary) {
      try {
        entry.summary = await fetchSummary(coinId);
      } catch (_) {}
    }
  } catch (err) {
    console.error('pregenerateImagesBackground failed:', err);
  }
}

// ===== crea embed + buffer para un rango =====
async function buildEmbedForRange(symbol, coinId, rangeId) {
  ensureCacheEntry(coinId);
  const entry = CACHE.get(coinId);

  // 1) serie
  if (!entry.ohlc[rangeId]) {
    let series;
    try {
      series = await fetchMarketSeries(coinId, rangeId);
    } catch (err) {
      console.error('buildEmbedForRange fetchMarketSeries failed:', err);
      return null;
    }
    if (!series || !series.length) return null;
    entry.ohlc[rangeId] = series;
  }

  const series = entry.ohlc[rangeId];

  // 2) imagen (buffer)
  if (!entry.images[rangeId]) {
    try {
      const labels = series.map((p) => {
        const d = new Date(p.t);
        return (
          d.toLocaleDateString('en-US') +
          ' ' +
          String(d.getHours()).padStart(2, '0') +
          ':' +
          String(d.getMinutes()).padStart(2, '0')
        );
      });
      const values = series.map((p) => Number(p.v));
      const first = values[0];
      const last = values[values.length - 1];
      const changePct =
        first && first !== 0 ? ((last - first) / first) * 100 : 0;

      const title = `${symbol.toUpperCase()} · ${money(
        last
      )} · ${percent(changePct)}`;
      const buffer = await createChartBuffer(labels, values, title);
      entry.images[rangeId] = buffer;
    } catch (err) {
      console.error('buildEmbedForRange createChartBuffer failed:', err);
      return null;
    }
  }

  // 3) summary en cache
  if (!entry.summary) {
    try {
      entry.summary = await fetchSummary(coinId);
    } catch (_) {
      entry.summary = null;
    }
  }

  // 4) precio fresco (simple/rápido)
  let fresh = null;
  try {
    const sp = await fetchSimplePrice(coinId);
    if (sp && sp[coinId]) {
      fresh = {
        price: sp[coinId].usd ?? null,
        market_cap: sp[coinId].usd_market_cap ?? null,
        vol24: sp[coinId].usd_24h_vol ?? null,
        change24: sp[coinId].usd_24h_change ?? null,
      };
    }
  } catch (_) {}

  const values = series.map((p) => Number(p.v));
  const first = values[0];
  const last = values[values.length - 1];
  const changeRange = first ? ((last - first) / first) * 100 : 0;

  const currentPrice =
    fresh?.price ??
    entry.summary?.market_data?.current_price?.usd ??
    last;
  const marketCapVal =
    fresh?.market_cap ?? entry.summary?.market_data?.market_cap?.usd ?? null;
  const vol24Val =
    fresh?.vol24 ?? entry.summary?.market_data?.total_volume?.usd ?? null;

  const imageName = `${symbol}-${rangeId}.png`;
  const embed = new EmbedBuilder()
    .setTitle(
      `${symbol.toUpperCase()} — ${
        RANGES.find((r) => r.id === rangeId)?.label || rangeId
      }`
    )
    .setColor(COLORS.main)
    .setImage(`attachment://${imageName}`)
    .setTimestamp();

  if (entry.summary?.market_data) {
    const md = entry.summary.market_data;
    const ch1 = md.price_change_percentage_1h_in_currency?.usd ?? null;
    const ch24 =
      fresh?.change24 ?? md.price_change_percentage_24h_in_currency?.usd ?? null;
    const ch7 = md.price_change_percentage_7d_in_currency?.usd ?? null;
    const ath = md.ath?.usd ?? null;
    const atl = md.atl?.usd ?? null;

    embed.addFields(
      {
        name: 'Market cap',
        value: marketCapVal ? money(marketCapVal) : 'N/A',
        inline: true,
      },
      {
        name: 'Price',
        value: currentPrice ? money(currentPrice) : 'N/A',
        inline: true,
      },
      {
        name: 'Change 1h',
        value:
          ch1 != null
            ? `${ch1 >= 0 ? '🔺' : '🔻'} ${percent(ch1)}`
            : 'N/A',
        inline: true,
      },
      {
        name: 'Change 24h',
        value:
          ch24 != null
            ? `${ch24 >= 0 ? '🔺' : '🔻'} ${percent(ch24)}`
            : 'N/A',
        inline: true,
      },
      {
        name: 'Change 7d',
        value:
          ch7 != null
            ? `${ch7 >= 0 ? '🔺' : '🔻'} ${percent(ch7)}`
            : 'N/A',
        inline: true,
      },
      {
        name: 'Volume 24h',
        value: vol24Val ? money(vol24Val) : 'N/A',
        inline: true,
      },
      {
        name: 'ATH',
        value: ath ? money(ath) : 'N/A',
        inline: true,
      },
      {
        name: 'ATL',
        value: atl ? money(atl) : 'N/A',
        inline: true,
      }
    );

    if (entry.summary.image?.large) {
      embed.setThumbnail(entry.summary.image.large);
    }
    embed.setFooter({ text: 'Data fetched from CoinGecko.com' });
  } else {
    embed.addFields(
      { name: 'Fuente', value: 'CoinGecko (resumen no disponible)', inline: true },
      {
        name: 'Change rango',
        value: percent(changeRange),
        inline: true,
      }
    );
  }

  return { embed, buffer: entry.images[rangeId], imageName };
}

// ===== componentes (select) =====
function buildSelectMenu(symbol) {
  const options = RANGES.map((r) => ({ label: r.label, value: r.id }));
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`cryptochart_select:${symbol}`)
    .setPlaceholder('Selecciona rango')
    .addOptions(options)
    .setMinValues(1)
    .setMaxValues(1);

  return [new ActionRowBuilder().addComponents(menu)];
}

// ===== cooldown =====
const COOLDOWNS = new Map();
function checkCooldown(userId) {
  const now = Date.now();
  const last = COOLDOWNS.get(userId) || 0;
  if (now - last < COOLDOWN_MS) {
    return COOLDOWN_MS - (now - last);
  }
  COOLDOWNS.set(userId, now);
  return 0;
}

// ===== export comando =====
module.exports = {
  name: 'cryptochart',
  description:
    'Gráfica y métricas (1h,1d,7d,30d,90d,180d,270d,365d) con menú desplegable.',
  category: 'Criptos',
  ejemplo: 'cryptochart btc',
  syntax: '!cryptochart <moneda>',

  data: new SlashCommandBuilder()
    .setName('cryptochart')
    .setDescription('Muestra gráfica con rangos y métricas')
    .addStringOption((opt) =>
      opt
        .setName('moneda')
        .setDescription('btc, eth, sol, bnb, xrp, doge (o id)')
        .setRequired(true)
    ),

  // ---- prefijo ----
  async executeMessage(msg, args) {
    const left = checkCooldown(msg.author.id);
    if (left > 0) {
      const until = Math.floor((Date.now() + left) / 1000);
      return msg.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('Vas muy rápido')
            .setDescription(`Puedes usar esto <t:${until}:R>.`)
            .setColor(COLORS.error),
        ],
      });
    }

    const raw = (args[0] || '').toLowerCase();
    if (!raw) {
      return msg.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('Uso incorrecto')
            .setDescription('Ej: `!cryptochart btc`')
            .setColor(COLORS.error),
        ],
      });
    }

    const coinId = resolveCoinId(raw);
    if (!coinId) {
      return msg.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('Moneda desconocida')
            .setColor(COLORS.error),
        ],
      });
    }

    try {
      ensureCacheEntry(coinId);
      const entry = CACHE.get(coinId);
      if (!entry.summary) {
        try {
          entry.summary = await fetchSummary(coinId);
        } catch (_) {}
      }

      const result = await buildEmbedForRange(raw, coinId, '1d');
      if (!result) throw new Error('no-embed');
      const { embed, buffer, imageName } = result;
      const attachment = new AttachmentBuilder(buffer, { name: imageName });

      const components = buildSelectMenu(raw);
      const sent = await msg.channel.send({
        embeds: [embed],
        components,
        files: [attachment],
      });

      // background: rangos cortos
      (async () => {
        const toBuild = ['1h', '1d', '7d', '30d'];
        await pregenerateImagesBackground(coinId, raw, toBuild);
      })();

      setTimeout(async () => {
        try {
          await sent.edit({ components: [] }).catch(() => {});
        } catch (_) {}
      }, CACHE_TTL);
    } catch (err) {
      console.error('cryptochart error (msg):', err);
      return msg.channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle('Error')
            .setDescription('No pude generar la gráfica para esa moneda.')
            .setColor(COLORS.error),
        ],
      });
    }
  },

  // ---- slash ----
  async executeInteraction(interaction) {
    const left = checkCooldown(interaction.user.id);
    if (left > 0) {
      const until = Math.floor((Date.now() + left) / 1000);
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('Vas muy rápido')
            .setDescription(`Puedes usar esto <t:${until}:R>.`)
            .setColor(COLORS.error),
        ],
        ephemeral: true,
      });
    }

    const raw = (interaction.options.getString('moneda') || '').toLowerCase();
    if (!raw) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('Uso incorrecto')
            .setDescription('Ej: `/cryptochart moneda:btc`')
            .setColor(COLORS.error),
        ],
        ephemeral: true,
      });
    }

    const coinId = resolveCoinId(raw);
    if (!coinId) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('Moneda desconocida')
            .setColor(COLORS.error),
        ],
        ephemeral: true,
      });
    }

    await interaction.deferReply();
    try {
      ensureCacheEntry(coinId);
      const entry = CACHE.get(coinId);
      if (!entry.summary) {
        try {
          entry.summary = await fetchSummary(coinId);
        } catch (_) {}
      }

      const result = await buildEmbedForRange(raw, coinId, '1d');
      if (!result) throw new Error('no-embed');
      const { embed, buffer, imageName } = result;
      const attachment = new AttachmentBuilder(buffer, { name: imageName });

      const components = buildSelectMenu(raw);
      const replyMsg = await interaction.editReply({
        embeds: [embed],
        components,
        files: [attachment],
      });

      (async () => {
        const toBuild = ['1h', '1d', '7d', '30d'];
        await pregenerateImagesBackground(coinId, raw, toBuild);
      })();

      setTimeout(async () => {
        try {
          await replyMsg.edit({ components: [] }).catch(() => {});
        } catch (_) {}
      }, CACHE_TTL);
    } catch (err) {
      console.error('cryptochart error (slash):', err);
      try {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle('Error')
              .setDescription('No pude generar la gráfica para esa moneda.')
              .setColor(COLORS.error),
          ],
        });
      } catch (_) {}
    }
  },

  // ---- handler del menú ----
  async handleInteraction(interaction) {
    if (!interaction.isStringSelectMenu()) return;
    if (!interaction.customId.startsWith('cryptochart_select:')) return;

    const symbol = interaction.customId.split(':')[1];
    const rangeId = (interaction.values && interaction.values[0]) || '1d';
    const coinId = resolveCoinId(symbol);

    try {
      await interaction.deferUpdate();
    } catch (_) {}

    try {
      const result = await buildEmbedForRange(symbol, coinId, rangeId);
      if (!result) {
        return interaction.followUp({
          content: 'No pude generar la gráfica para ese rango.',
          ephemeral: true,
        });
      }
      const { embed, buffer, imageName } = result;
      const attachment = new AttachmentBuilder(buffer, { name: imageName });
      const components = buildSelectMenu(symbol);

      try {
        if (interaction.message && interaction.message.edit) {
          await interaction.message
            .edit({ embeds: [embed], components, files: [attachment] })
            .catch(() => {});
        } else {
          await interaction
            .editReply({ embeds: [embed], components, files: [attachment] })
            .catch(() => {});
        }
      } catch (_) {
        try {
          await interaction.followUp({
            content: 'Error actualizando mensaje.',
            ephemeral: true,
          });
        } catch (_) {}
      }
    } catch (err) {
      console.error('cryptochart select error:', err);
      try {
        await interaction.followUp({
          content: 'Ocurrió un error al generar la gráfica.',
          ephemeral: true,
        });
      } catch (_) {}
    }
  },
};
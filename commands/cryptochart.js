// commands/cryptochart.js
const {
  EmbedBuilder,
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} = require('discord.js');

const fetch = globalThis.fetch || require('node-fetch');
const { COINS } = require('../utils/cryptoUtils');

const QUICKCHART_CREATE = 'https://quickchart.io/chart/create';
const COLORS = { main: '#6A0DAD', darkBorder: '#3a0050', error: '#ED4245' };

const CACHE_TTL = 10 * 60 * 1000; // 10 minutos para cachear series/urls
const COOLDOWN_MS = 10 * 1000;    // 10s
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 600;

// TODOS los rangos usan 24 puntos
const TARGET_POINTS = 24;

// Rangos oficiales
const RANGES = [
  { id: '1h',   label: 'Última hora' },
  { id: '1d',   label: 'Último día' },
  { id: '7d',   label: 'Última semana' },   // ESTE será el rango por defecto
  { id: '30d',  label: 'Último mes' },
  { id: '180d', label: 'Últimos 6 meses' },
  { id: '365d', label: 'Últimos 12 meses' },
];

// ===== helpers básicos =====
function money(n) {
  return n == null
    ? 'N/A'
    : '$' +
        Number(n).toLocaleString('en-US', {
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

// ===== CoinGecko helper (usa COINGECKO_MODE y COINGECKO_API) =====
const COINGECKO_MODE = process.env.COINGECKO_MODE || 'free'; // 'free' | 'demo' | 'pro'
const COINGECKO_API = process.env.COINGECKO_API || '';

function cgBaseUrl() {
  // si tienes pro y tu otra lógica, cambia aquí si hace falta
  if (COINGECKO_MODE === 'pro') {
    return 'https://pro-api.coingecko.com/api/v3';
  }
  // demo y free usan el host normal
  return 'https://api.coingecko.com/api/v3';
}

async function cgFetch(path) {
  const url = cgBaseUrl() + path;
  const headers = {};

  if (COINGECKO_API) {
    if (COINGECKO_MODE === 'demo') {
      headers['x-cg-demo-api-key'] = COINGECKO_API;
    } else if (COINGECKO_MODE === 'pro') {
      headers['x-cg-pro-api-key'] = COINGECKO_API;
    } else {
      // fallback: usa demo header si estás en "free" pero pones key
      headers['x-cg-demo-api-key'] = COINGECKO_API;
    }
  }

  const res = await fetch(url, { headers });

  if (!res.ok) {
    const e = new Error(`CoinGecko ${res.status}`);
    e.status = res.status;
    throw e;
  }
  return res;
}

// ===== reintentos =====
async function retryable(fn, attempts = MAX_RETRIES) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const str = String(err).toLowerCase();
      const status = err.status || 0;

      // 401: problema de auth -> no reintentar en bucle
      if (status === 401) break;

      // 429: demasiadas peticiones → backoff suave
      if (status === 429 || str.includes('429')) {
        const backoff = RETRY_BASE_MS * (i + 1);
        await sleep(backoff);
        continue;
      }

      // 5xx o error CoinGecko → backoff
      if ((status >= 500 && status < 600) || str.includes('coingecko')) {
        const backoff = RETRY_BASE_MS * (i + 1);
        await sleep(backoff);
        continue;
      }

      // otros códigos → no reintentar
      break;
    }
  }
  throw lastErr;
}

// ===== downsample a 24 puntos =====
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

// ===== QuickChart: genera URL del gráfico =====
async function createQuickChartUrl(labels, values, title) {
  const cfg = {
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
        x: { display: false, grid: { display: false } },
        y: {
          ticks: {
            callback: (v) =>
              typeof v === 'number'
                ? '$' + Number(v).toLocaleString()
                : v,
          },
          grid: { color: 'rgba(200,200,200,0.12)', lineWidth: 1 },
        },
      },
      elements: { line: { borderJoinStyle: 'round' } },
    },
  };

  const body = {
    chart: cfg,
    backgroundColor: 'transparent',
    width: 1200,
    height: 420,
  };

  return retryable(async () => {
    const controller =
      typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeout = controller
      ? setTimeout(() => controller.abort(), 15000)
      : null;

    const res = await fetch(QUICKCHART_CREATE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller ? controller.signal : undefined,
    });

    if (timeout) clearTimeout(timeout);

    if (!res.ok) {
      const txt = await res.text().catch(() => null);
      const e = new Error(`QuickChart ${res.status} ${txt || ''}`);
      e.status = res.status;
      throw e;
    }

    const json = await res.json();
    return json.url || null;
  });
}

// ===== CoinGecko: SERIE DE PRECIOS (24 puntos) =====
async function fetchMarketSeries(coinId, rangeId) {
  return retryable(async () => {
    const now = Math.floor(Date.now() / 1000);

    // 1h -> /range
    if (rangeId === '1h') {
      const from = now - 3600;
      const res = await cgFetch(
        `/coins/${encodeURIComponent(
          coinId
        )}/market_chart/range?vs_currency=usd&from=${from}&to=${now}`
      );
      const j = await res.json();
      if (!j.prices || !j.prices.length) return null;

      const arr = j.prices.map((p) => ({ t: p[0], v: p[1] }));
      return downsample(arr, TARGET_POINTS);
    }

    // resto: /market_chart con days + interval
    let days = 7;
    let interval = 'hourly';

    if (rangeId === '1d') {
      days = 1;
      interval = 'hourly';
    } else if (rangeId === '7d') {
      days = 7;
      interval = 'hourly';
    } else if (rangeId === '30d') {
      days = 30;
      interval = 'daily';
    } else if (rangeId === '180d') {
      days = 180;
      interval = 'daily';
    } else if (rangeId === '365d') {
      days = 365;
      interval = 'daily';
    }

    const res2 = await cgFetch(
      `/coins/${encodeURIComponent(
        coinId
      )}/market_chart?vs_currency=usd&days=${days}&interval=${interval}`
    );
    const j2 = await res2.json();
    if (!j2.prices || !j2.prices.length) return null;

    const arr = j2.prices.map((p) => ({ t: p[0], v: p[1] }));
    return downsample(arr, TARGET_POINTS);
  });
}

// ===== cache =====
// coinId => { ohlc:{range:series[]}, images:{range:url}, timeoutHandle }
const CACHE = new Map();

function ensureCacheEntry(coinId) {
  if (!CACHE.has(coinId)) {
    const entry = {
      ohlc: {},
      images: {},
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

// ===== crea embed para un rango =====
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

  // 2) URL de QuickChart
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
      const url = await createQuickChartUrl(labels, values, title);
      if (!url) return null;
      entry.images[rangeId] = url;
    } catch (err) {
      console.error('buildEmbedForRange createQuickChartUrl failed:', err);
      return null;
    }
  }

  // 3) datos básicos calculados de la serie
  const values = series.map((p) => Number(p.v));
  const first = values[0];
  const last = values[values.length - 1];
  const changeRange = first ? ((last - first) / first) * 100 : 0;

  const embed = new EmbedBuilder()
    .setTitle(
      `${symbol.toUpperCase()} — ${
        RANGES.find((r) => r.id === rangeId)?.label || rangeId
      }`
    )
    .setColor(COLORS.main)
    .setImage(entry.images[rangeId])
    .setTimestamp()
    .addFields(
      {
        name: 'Precio actual (aprox.)',
        value: money(last),
        inline: true,
      },
      {
        name: 'Cambio en el rango',
        value: percent(changeRange),
        inline: true,
      },
      {
        name: 'Fuente',
        value: 'CoinGecko + QuickChart (24 puntos)',
        inline: false,
      }
    );

  return embed;
}

// ===== select menu =====
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
    'Gráfica (QuickChart) y datos básicos (1h,1d,7d,30d,180d,365d) con menú.',
  category: 'Criptos',
  ejemplo: 'cryptochart btc',
  syntax: '!cryptochart <moneda>',

  data: new SlashCommandBuilder()
    .setName('cryptochart')
    .setDescription('Muestra gráfica con rangos y métricas básicas')
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

      // rango por defecto: 7d
      const embed = await buildEmbedForRange(raw, coinId, '7d');
      if (!embed) throw new Error('no-embed');

      const components = buildSelectMenu(raw);
      const sent = await msg.channel.send({ embeds: [embed], components });

      // desactivar menú tras TTL
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
            .setDescription(
              'No pude generar la gráfica para esa moneda (CoinGecko / QuickChart).'
            )
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

      const embed = await buildEmbedForRange(raw, coinId, '7d');
      if (!embed) throw new Error('no-embed');

      const components = buildSelectMenu(raw);
      const replyMsg = await interaction.editReply({
        embeds: [embed],
        components,
      });

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
              .setDescription(
                'No pude generar la gráfica para esa moneda (CoinGecko / QuickChart).'
              )
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
    const rangeId = (interaction.values && interaction.values[0]) || '7d';
    const coinId = resolveCoinId(symbol);

    try {
      await interaction.deferUpdate();
    } catch (_) {}

    try {
      const embed = await buildEmbedForRange(symbol, coinId, rangeId);
      if (!embed) {
        return interaction.followUp({
          content: 'No pude generar la gráfica para ese rango.',
          ephemeral: true,
        });
      }

      const components = buildSelectMenu(symbol);

      try {
        if (interaction.message && interaction.message.edit) {
          await interaction.message
            .edit({ embeds: [embed], components })
            .catch(() => {});
        } else {
          await interaction
            .editReply({ embeds: [embed], components })
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
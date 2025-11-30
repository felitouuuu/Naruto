// commands/cryptochart.js
const {
  EmbedBuilder,
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder
} = require('discord.js');

// fetch: usa global fetch si existe, si no intenta node-fetch
const fetch = (globalThis.fetch) ? globalThis.fetch : require('node-fetch');
const { COINS } = require('../utils/cryptoUtils');

const COLORS = { main: '#6A0DAD', error: '#ED4245' };
const QUICKCHART_CREATE = 'https://quickchart.io/chart/create';
const MAX_POINTS = 240; // max puntos en la serie (se muestrea si hay más)

// --- CACHE Y DEDUPLICACIÓN PARA EVITAR 429 ---
const MARKET_CACHE = new Map(); // key -> { ts, data }
const CACHE_TTL_MS = 20 * 1000; // 20s TTL (ajustable)
const IN_FLIGHT = new Map(); // key -> Promise (para deduplicar requests concurrentes)

// RANGOS que mostramos (id -> etiqueta)
const RANGES = [
  { id: '1h', label: '1h' },
  { id: '24h', label: '24h' },
  { id: '7d', label: '7d' },
  { id: '30d', label: '30d' },
  { id: '6m', label: '6m' },
  { id: '365d', label: '1 año' }
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

// Helper: fetch con retry/backoff y respeto a Retry-After
async function fetchWithRetry(url, opts = {}, maxAttempts = 4) {
  let attempt = 0;
  while (attempt < maxAttempts) {
    attempt++;
    let res;
    try {
      res = await fetch(url, opts);
    } catch (err) {
      // error de red: reintentar con backoff
      if (attempt >= maxAttempts) throw err;
      const wait = Math.min(2 ** attempt, 8) * 1000 + Math.random() * 300;
      await new Promise(r => setTimeout(r, wait));
      continue;
    }

    if (res.ok) return res;

    if (res.status === 429) {
      // leer Retry-After si existe
      const ra = res.headers && typeof res.headers.get === 'function' ? res.headers.get('retry-after') : null;
      const waitSec = ra ? Number(ra) : Math.min(2 ** attempt, 8);
      const jitter = Math.random() * 500;
      await new Promise(r => setTimeout(r, (waitSec * 1000) + jitter));
      // reintentar
      continue;
    }

    // otros errores: lanzar
    throw new Error(`CoinGecko ${res.status}`);
  }
  throw new Error('CoinGecko 429 (max retries)');
}

// Resolve coin id desde input (símbolo o id)
function resolveCoinId(input) {
  if (!input) return null;
  const s = input.toLowerCase();
  return COINS[s] || s;
}

// Obtiene precios desde CoinGecko (soporta '1h' con range endpoint y días para otros)
// Usa cache y deduplicación para evitar 429 por peticiones concurrentes/rápidas
async function fetchMarketData(coinId, rangeId) {
  const key = `market:${coinId}:${rangeId}`;
  const now = Date.now();

  // usar caché si está fresca
  const cached = MARKET_CACHE.get(key);
  if (cached && (now - cached.ts) < CACHE_TTL_MS) {
    return cached.data;
  }

  // si ya hay una petición en vuelo para la misma key, esperarla (dedupe)
  if (IN_FLIGHT.has(key)) {
    try {
      const data = await IN_FLIGHT.get(key);
      return data;
    } catch (e) {
      // si la petición en vuelo falló, continuar y hacer un nuevo intento
      IN_FLIGHT.delete(key);
    }
  }

  // crear promesa en vuelo
  const p = (async () => {
    const nowSec = Math.floor(Date.now() / 1000);

    if (rangeId === '1h') {
      const from = nowSec - 3600;
      const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}/market_chart/range?vs_currency=usd&from=${from}&to=${nowSec}`;
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

    // determinar days param
    let days;
    const r = RANGES.find(x => x.id === rangeId);
    days = r && r.id === '24h' ? 1 : (r && r.id === '7d' ? 7 : (r && r.id === '30d' ? 30 : (r && r.id === '6m' ? 180 : (r && r.id === '365d' ? 365 : 1))));

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
  })();

  IN_FLIGHT.set(key, p);

  try {
    const result = await p;
    MARKET_CACHE.set(key, { ts: Date.now(), data: result });
    return result;
  } finally {
    IN_FLIGHT.delete(key);
  }
}

// Obtiene resumen del coin (market metrics) con cache y retry
async function fetchCoinSummary(coinId) {
  const key = `summary:${coinId}`;
  const now = Date.now();
  const cached = MARKET_CACHE.get(key);
  if (cached && (now - cached.ts) < CACHE_TTL_MS) return cached.data;

  if (IN_FLIGHT.has(key)) {
    try {
      return await IN_FLIGHT.get(key);
    } catch (e) {
      IN_FLIGHT.delete(key);
    }
  }

  const p = (async () => {
    const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`;
    const r = await fetchWithRetry(url);
    if (!r.ok) throw new Error(`CoinGecko ${r.status}`);
    return r.json();
  })();

  IN_FLIGHT.set(key, p);
  try {
    const data = await p;
    MARKET_CACHE.set(key, { ts: Date.now(), data });
    return data;
  } finally {
    IN_FLIGHT.delete(key);
  }
}

// Genera embed y chartUrl para un rango dado
async function generateEmbedForRange(symbol, coinId, rangeId) {
  // Intentar obtener precios; si CoinGecko devuelve 429 repetidamente, capturamos y devolvemos null
  let prices;
  try {
    prices = await fetchMarketData(coinId, rangeId);
  } catch (err) {
    // Propagar error para que el handler lo loguee y muestre mensaje amigable
    throw err;
  }

  if (!prices || prices.length === 0) return null;

  let summary = null;
  try { summary = await fetchCoinSummary(coinId); } catch (e) { summary = null; }

  // crear etiquetas concisas (fechas/hora)
  const labels = prices.map(p => {
    const d = new Date(p.t);
    return `${d.toLocaleDateString('en-US')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  });
  const values = prices.map(p => Number(p.v));

  const first = values[0];
  const last = values[values.length - 1];
  const changePct = first && first !== 0 ? ((last - first) / first * 100) : 0;

  const title = `${symbol.toUpperCase()} · ${money(last)} · ${Number(changePct).toFixed(2)}%`;
  // generar url corta en QuickChart
  const chartUrl = await createQuickChartUrl(labels, values.map(v => Number(v.toFixed(8))), title);

  const embed = new EmbedBuilder()
    .setTitle(`${symbol.toUpperCase()} — ${RANGES.find(r=>r.id===rangeId)?.label || rangeId}`)
    .setDescription(`Último: **${money(last)}** • Cambio: **${Number(changePct).toFixed(2)}%**`)
    .setColor(COLORS.main)
    .setImage(chartUrl)
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

// Construye un Select Menu con los rangos
function buildSelectMenu(symbol, placeholder = 'Selecciona rango') {
  const options = RANGES.map(r => ({
    label: r.label,
    value: r.id,
    description: `Ver ${r.label}`
  }));

  const select = new StringSelectMenuBuilder()
    .setCustomId(`cryptochart_select:${symbol}`)
    .setPlaceholder(placeholder)
    .addOptions(...options)
    .setMinValues(1)
    .setMaxValues(1);

  const row = new ActionRowBuilder().addComponents(select);
  return [row];
}

// Construye un Select Menu deshabilitado (mientras se procesa)
function buildDisabledSelectMenu(symbol, placeholder = 'Procesando...') {
  const options = RANGES.map(r => ({
    label: r.label,
    value: r.id,
    description: `Ver ${r.label}`
  }));

  const select = new StringSelectMenuBuilder()
    .setCustomId(`cryptochart_select:${symbol}`)
    .setPlaceholder(placeholder)
    .addOptions(...options)
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(true);

  const row = new ActionRowBuilder().addComponents(select);
  return [row];
}

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

  // --- Prefijo
  async executeMessage(msg, args) {
    const raw = (args[0] || '').toLowerCase();
    if (!raw) return msg.channel.send({ embeds: [ new EmbedBuilder().setTitle('Uso incorrecto').setDescription('Ej: `!cryptochart btc`').setColor(COLORS.error) ] });

    const coinId = resolveCoinId(raw);
    const symbol = raw;

    try {
      const infoRes = await fetchWithRetry(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}?localization=false`);
      if (!infoRes.ok) return msg.channel.send({ embeds: [ new EmbedBuilder().setTitle('Error').setDescription('Moneda no encontrada en CoinGecko.').setColor(COLORS.error) ] });
    } catch (e) {
      return msg.channel.send({ embeds: [ new EmbedBuilder().setTitle('Error').setDescription('No pude contactar CoinGecko. Intenta de nuevo más tarde.').setColor(COLORS.error) ] });
    }

    try {
      // por defecto 24h
      const embed = await generateEmbedForRange(symbol, coinId, '24h');
      if (!embed) throw new Error('no-embed');
      const components = buildSelectMenu(symbol, 'Selecciona rango');
      return msg.channel.send({ embeds: [embed], components });
    } catch (err) {
      console.error('cryptochart error (msg):', err);
      return msg.channel.send({ embeds: [ new EmbedBuilder().setTitle('Error').setDescription('No pude generar la gráfica para esa moneda. Intenta de nuevo en unos segundos.').setColor(COLORS.error) ] });
    }
  },

  // --- Slash
  async executeInteraction(interaction) {
    const raw = (interaction.options.getString('moneda') || '').toLowerCase();
    if (!raw) return interaction.reply({ embeds: [ new EmbedBuilder().setTitle('Uso incorrecto').setDescription('Ej: `/cryptochart moneda:btc`').setColor(COLORS.error) ], ephemeral: true });

    const coinId = resolveCoinId(raw);
    const symbol = raw;

    try {
      const infoRes = await fetchWithRetry(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}?localization=false`);
      if (!infoRes.ok) return interaction.reply({ embeds: [ new EmbedBuilder().setTitle('Error').setDescription('Moneda no encontrada en CoinGecko.').setColor(COLORS.error) ], ephemeral: true });
    } catch (e) {
      return interaction.reply({ embeds: [ new EmbedBuilder().setTitle('Error').setDescription('No pude contactar CoinGecko. Intenta de nuevo más tarde.').setColor(COLORS.error) ], ephemeral: true });
    }

    try {
      const embed = await generateEmbedForRange(symbol, coinId, '24h');
      if (!embed) throw new Error('no-embed');
      return interaction.reply({ embeds: [embed], components: buildSelectMenu(symbol, 'Selecciona rango'), ephemeral: false });
    } catch (err) {
      console.error('cryptochart error (slash):', err);
      return interaction.reply({ embeds: [ new EmbedBuilder().setTitle('Error').setDescription('No pude generar la gráfica para esa moneda. Intenta de nuevo en unos segundos.').setColor(COLORS.error) ], ephemeral: true });
    }
  },

  // --- Manejo select menu (con deferUpdate para evitar "Interacción fallida")
  async handleInteraction(interaction) {
    // Procesar solo selects con nuestro customId
    if (!interaction.isStringSelectMenu()) return;
    const cid = interaction.customId || '';
    if (!cid.startsWith('cryptochart_select:')) return;

    const parts = cid.split(':');
    if (parts.length !== 2) return interaction.reply({ content: 'Formato inválido', ephemeral: true });

    const symbol = parts[1];
    const coinId = resolveCoinId(symbol);

    // valor seleccionado (solo 1)
    const values = interaction.values || [];
    if (!values.length) return interaction.reply({ content: 'Selecciona un rango válido.', ephemeral: true });
    const rangeId = values[0];

    // ACK inmediato para evitar "Interacción fallida"
    try {
      await interaction.deferUpdate(); // reconoce la interacción inmediatamente
    } catch (e) {
      // Si deferUpdate falla, respondemos ephemer y salimos
      try {
        return interaction.reply({ content: 'No pude procesar la interacción en este momento. Intenta de nuevo.', ephemeral: true });
      } catch (ex) {
        console.error('Failed to reply after deferUpdate failure:', ex);
        return;
      }
    }

    // Deshabilitar select mientras procesamos (mejor UX)
    try {
      await interaction.editReply({ components: buildDisabledSelectMenu(symbol) });
    } catch (e) {
      // no crítico: seguimos con la generación
    }

    try {
      const embed = await generateEmbedForRange(symbol, coinId, rangeId);
      if (!embed) {
        const errEmbed = new EmbedBuilder().setTitle('Error').setDescription('No pude generar la gráfica para esa moneda/rango. Intenta de nuevo en unos segundos.').setColor(COLORS.error);
        try {
          return interaction.editReply({ embeds: [errEmbed], components: buildSelectMenu(symbol, 'Selecciona rango') });
        } catch (e) {
          return interaction.followUp({ content: 'No pude generar la gráfica para esa moneda/rango.', ephemeral: true });
        }
      }

      // Re-habilitar select con placeholder indicando el rango actual
      const components = buildSelectMenu(symbol, `Rango: ${RANGES.find(r => r.id === rangeId)?.label || rangeId}`);
      try {
        return interaction.editReply({ embeds: [embed], components });
      } catch (e) {
        // si editReply falla, intentar update (compatibilidad)
        try {
          return interaction.update({ embeds: [embed], components });
        } catch (ex) {
          console.error('Failed to edit/update after successful embed generation:', ex);
          return interaction.followUp({ content: 'Gráfica generada, pero no pude actualizar el mensaje. Intenta de nuevo.', ephemeral: true });
        }
      }
    } catch (err) {
      // Si el error viene de CoinGecko 429, devolvemos mensaje amigable y no mostramos stack trace al usuario
      console.error('cryptochart select error:', err);
      const is429 = err && err.message && err.message.includes('429');
      const errEmbed = new EmbedBuilder()
        .setTitle('Error')
        .setDescription(is429 ? 'CoinGecko está limitando las peticiones. Intenta de nuevo en unos segundos.' : 'Ocurrió un error al generar la gráfica.')
        .setColor(COLORS.error);

      try {
        return interaction.editReply({ embeds: [errEmbed], components: buildSelectMenu(symbol, 'Selecciona rango') });
      } catch (e) {
        try {
          return interaction.followUp({ content: is429 ? 'CoinGecko está limitando las peticiones. Intenta de nuevo en unos segundos.' : 'Ocurrió un error al generar la gráfica.', ephemeral: true });
        } catch (ex) {
          console.error('Failed to followUp after editReply failure:', ex);
        }
      }
    }
  }
};

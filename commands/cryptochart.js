// commands/cryptochart.js
const {
  EmbedBuilder,
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder
} = require('discord.js');

const fetch = globalThis.fetch || require('node-fetch');
const { COINS } = require('../utils/cryptoUtils');

const COLORS = { main: '#6A0DAD', error: '#ED4245' };
const QUICKCHART_CREATE = 'https://quickchart.io/chart/create';
const MAX_POINTS = 240;
const IMAGE_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutos
const EMBED_LIVE_TTL_MS = 10 * 60 * 1000; // 10 minutos para desactivar select
const COINGECKO_RETRY_MAX = 3;
const COOLDOWN_MS = 10 * 1000; // 10s por usuario

// RANGOS: quitamos "max" y añadimos 1h. Mapearemos a days param o usar range endpoint.
const RANGES = [
  { id: '1h', label: 'Última hora' },
  { id: '24h', label: 'Último día', days: 1 },
  { id: '7d', label: 'Últimos 7d', days: 7 },
  { id: '30d', label: 'Últimos 30d', days: 30 },
  { id: '120d', label: 'Últimos 4 meses', days: 120 },
  { id: '365d', label: 'Último año', days: 365 }
];

// caches en memoria
// cacheImages[coinId] = { images: { rangeId: url }, createdAt, timeoutId }
const cacheImages = {};
// cooldown por usuario
const cooldowns = {};

// helpers de formato
const money = n => n == null ? 'N/A' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const percent = n => n == null ? 'N/A' : `${Number(n).toFixed(2)}%`;
const resolveCoinId = input => (input ? (COINS[input.toLowerCase()] || input.toLowerCase()) : null);

// retry simple con backoff para CoinGecko
async function fetchWithRetries(url, opts = {}, attempts = COINGECKO_RETRY_MAX) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await fetch(url, opts);
      if (!r.ok) {
        // si es 429, esperar y reintentar
        if (r.status === 429) {
          const wait = 1000 * Math.pow(2, i); // exponencial
          await new Promise(res => setTimeout(res, wait));
          lastErr = new Error(`CoinGecko ${r.status}`);
          continue;
        }
        throw new Error(`CoinGecko ${r.status}`);
      }
      return r;
    } catch (err) {
      lastErr = err;
      const wait = 500 * Math.pow(2, i);
      await new Promise(res => setTimeout(res, wait));
    }
  }
  throw lastErr;
}

// crea chart en QuickChart (POST -> devuelve url)
async function createQuickChartUrl(labels, values, title, color = 'rgb(106,13,173)') {
  const cfg = {
    type: 'line',
    data: { labels, datasets: [{ label: title, data: values, fill: true, borderColor: color, backgroundColor: color, pointRadius: 0, tension: 0.12 }] },
    options: {
      plugins: { legend: { display: false }, title: { display: true, text: title, font: { size: 16 } } },
      scales: { x: { display: false }, y: { ticks: { callback: v => typeof v === 'number' ? ('$' + Number(v).toLocaleString()) : v } } },
      elements: { line: { borderWidth: 2 } }
    }
  };

  const res = await fetch(QUICKCHART_CREATE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chart: cfg, backgroundColor: 'transparent', width: 1200, height: 420 })
  });

  if (!res.ok) throw new Error(`QuickChart ${res.status}`);
  const j = await res.json();
  return j.url || null;
}

// obtiene precios desde CoinGecko (soporta '1h' con range endpoint)
async function fetchMarketData(coinId, rangeId) {
  const now = Math.floor(Date.now() / 1000);

  if (rangeId === '1h') {
    const from = now - 3600;
    const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}/market_chart/range?vs_currency=usd&from=${from}&to=${now}`;
    const r = await fetchWithRetries(url);
    const j = await r.json();
    if (!j.prices || !j.prices.length) return null;
    let prices = j.prices.map(p => ({ t: p[0], v: p[1] }));
    if (prices.length > MAX_POINTS) {
      const step = Math.ceil(prices.length / MAX_POINTS);
      prices = prices.filter((_, i) => i % step === 0);
    }
    return prices;
  }

  const rangeObj = RANGES.find(r => r.id === rangeId);
  const days = rangeObj?.days ?? 1;
  const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}/market_chart?vs_currency=usd&days=${days}`;
  const r = await fetchWithRetries(url);
  const j = await r.json();
  if (!j.prices || !j.prices.length) return null;
  let prices = j.prices.map(p => ({ t: p[0], v: p[1] }));
  if (prices.length > MAX_POINTS) {
    const step = Math.ceil(prices.length / MAX_POINTS);
    prices = prices.filter((_, i) => i % step === 0);
  }
  return prices;
}

// obtiene summary (market_data) de CoinGecko (llamada ligera)
async function fetchCoinSummary(coinId) {
  const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`;
  const r = await fetchWithRetries(url);
  const j = await r.json();
  return j;
}

// genera imagen (QuickChart) para un rango y la guarda en cacheImages
async function generateImageForRange(coinId, symbol, rangeId) {
  try {
    const prices = await fetchMarketData(coinId, rangeId);
    if (!prices || !prices.length) throw new Error('no-prices');
    const labels = prices.map(p => {
      const d = new Date(p.t);
      return `${d.toLocaleDateString('en-US')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    });
    const values = prices.map(p => Number(p.v.toFixed(8)));
    const first = values[0], last = values[values.length - 1];
    const changePct = (first && first !== 0) ? ((last - first) / first * 100) : 0;
    const title = `${symbol.toUpperCase()} · ${money(last)} · ${Number(changePct).toFixed(2)}%`;
    const url = await createQuickChartUrl(labels, values, title);
    if (!url) throw new Error('no-url');
    // save to cacheImages
    cacheImages[coinId] = cacheImages[coinId] || { images: {}, createdAt: Date.now(), timeoutId: null };
    cacheImages[coinId].images[rangeId] = url;
    // ensure TTL timer exists
    if (cacheImages[coinId].timeoutId) {
      clearTimeout(cacheImages[coinId].timeoutId);
    }
    cacheImages[coinId].createdAt = Date.now();
    cacheImages[coinId].timeoutId = setTimeout(() => {
      try { delete cacheImages[coinId]; } catch (e) {}
    }, IMAGE_CACHE_TTL_MS);
    return url;
  } catch (err) {
    throw err;
  }
}

// genera embed usando imageUrl (imagen tomada de cache o recién generada) y summary fresco
async function buildEmbedWithImage(symbol, coinId, rangeId, imageUrl) {
  // traer resumen actualizado (price y metrics)
  let summary = null;
  try { summary = await fetchCoinSummary(coinId); } catch (e) { summary = null; }

  let price = null, marketCap = null, vol24 = null, ath = null, atl = null, ch1 = null, ch24 = null, ch7 = null;
  if (summary?.market_data) {
    const md = summary.market_data;
    price = md.current_price?.usd ?? null;
    marketCap = md.market_cap?.usd ?? null;
    vol24 = md.total_volume?.usd ?? null;
    ath = md.ath?.usd ?? null;
    atl = md.atl?.usd ?? null;
    ch1 = md.price_change_percentage_1h_in_currency?.usd ?? null;
    ch24 = md.price_change_percentage_24h_in_currency?.usd ?? null;
    ch7 = md.price_change_percentage_7d_in_currency?.usd ?? null;
  }

  const titleRange = RANGES.find(r => r.id === rangeId)?.label || rangeId;
  const embed = new EmbedBuilder()
    .setTitle(`${symbol.toUpperCase()} — ${titleRange}`)
    .setDescription(`Último: **${money(price)}** • Change (24h): **${percent(ch24)}**`)
    .setColor(COLORS.main)
    .setTimestamp();

  if (imageUrl) embed.setImage(imageUrl);

  // fields
  embed.addFields(
    { name: 'Market cap', value: marketCap ? money(marketCap) : 'N/A', inline: true },
    { name: 'Price', value: price ? money(price) : 'N/A', inline: true },
    { name: 'Change 1h', value: ch1 !== null ? `${ch1 >= 0 ? '🔺' : '🔻'} ${percent(ch1)}` : 'N/A', inline: true },
    { name: 'Change 24h', value: ch24 !== null ? `${ch24 >= 0 ? '🔺' : '🔻'} ${percent(ch24)}` : 'N/A', inline: true },
    { name: 'Change 7d', value: ch7 !== null ? `${ch7 >= 0 ? '🔺' : '🔻'} ${percent(ch7)}` : 'N/A', inline: true },
    { name: 'ATH', value: ath ? money(ath) : 'N/A', inline: true },
    { name: 'ATL', value: atl ? money(atl) : 'N/A', inline: true }
  );

  if (summary?.image?.large) embed.setThumbnail(summary.image.large);
  embed.setFooter({ text: 'Data fetched from CoinGecko.com' });
  return embed;
}

// construye el select menu para interactuar
function buildSelectMenu(symbol) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`cryptochart_select:${symbol}`)
    .setPlaceholder('Selecciona un rango')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(RANGES.map(r => ({ label: r.label, value: r.id })));
  return [new ActionRowBuilder().addComponents(menu)];
}

// cooldown check (retorna ms restantes)
function checkCooldown(userId) {
  const now = Date.now();
  if (cooldowns[userId] && (now - cooldowns[userId] < COOLDOWN_MS)) {
    return COOLDOWN_MS - (now - cooldowns[userId]);
  }
  cooldowns[userId] = now;
  return 0;
}

// background: generar imágenes restantes (no bloquear respuesta inicial)
async function generateRemainingImagesInBackground(coinId, symbol, already) {
  const toGen = RANGES.map(r => r.id).filter(id => id !== already);
  // generar secuencialmente con pausas para evitar rate-limit
  for (const rangeId of toGen) {
    // si ya existe en cache skip
    if (cacheImages[coinId] && cacheImages[coinId].images && cacheImages[coinId].images[rangeId]) continue;
    try {
      // pequeña espera entre requests
      await new Promise(res => setTimeout(res, 700));
      await generateImageForRange(coinId, symbol, rangeId);
      // after generate, small pause
      await new Promise(res => setTimeout(res, 400));
    } catch (err) {
      console.error(`cryptochart: error generating image for ${symbol} ${rangeId}:`, err && err.message ? err.message : err);
      // continue with next range
      await new Promise(res => setTimeout(res, 800));
    }
  }
}

// schedule disable components after EMBED_LIVE_TTL_MS
function scheduleDisableComponents(message) {
  setTimeout(async () => {
    try {
      await message.edit({ components: [] }).catch(() => {});
    } catch (e) {}
  }, EMBED_LIVE_TTL_MS);
}

// EXPORT COMMAND
module.exports = {
  name: 'cryptochart',
  description: 'Muestra gráfica y métricas de una moneda (menú de rangos).',
  category: 'Criptos',
  ejemplo: 'cryptochart btc',
  syntax: '!cryptochart <moneda>',

  data: new SlashCommandBuilder()
    .setName('cryptochart')
    .setDescription('Muestra gráfica de precio con rangos')
    .addStringOption(opt => opt.setName('moneda').setDescription('btc, eth, sol, bnb, xrp, doge (o id)').setRequired(true)),

  // PREFIJO
  async executeMessage(msg, args) {
    const rem = checkCooldown(msg.author.id);
    if (rem > 0) {
      const unlock = Math.floor((Date.now() + rem) / 1000);
      return msg.reply({ embeds: [new EmbedBuilder().setTitle('Whoo! Vas muy rápido').setDescription(`Podrás volver a ejecutar este comando <t:${unlock}:R>.`).setColor(COLORS.error)] });
    }

    const raw = (args[0] || '').toLowerCase();
    if (!raw) return msg.reply({ content: 'Debes indicar una moneda. Ej: `!cryptochart btc`' });

    const coinId = resolveCoinId(raw);
    const symbol = raw;

    try {
      // validar existencia
      const infoRes = await fetchWithRetries(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}?localization=false`);
      if (!infoRes.ok) return msg.reply({ embeds: [new EmbedBuilder().setTitle('Error').setDescription('Moneda no encontrada en CoinGecko.').setColor(COLORS.error)] });
    } catch (e) {
      return msg.reply({ embeds: [new EmbedBuilder().setTitle('Error').setDescription('No pude contactar CoinGecko.').setColor(COLORS.error)] });
    }

    // preparar cache entry
    cacheImages[coinId] = cacheImages[coinId] || { images: {}, createdAt: Date.now(), timeoutId: null };

    // generar imagen 24h (bloqueante) para respuesta inicial
    let img24 = cacheImages[coinId].images['24h'];
    try {
      if (!img24) {
        img24 = await generateImageForRange(coinId, symbol, '24h');
      }
    } catch (err) {
      console.error('cryptochart error generating initial 24h:', err && err.message ? err.message : err);
      return msg.reply({ embeds: [new EmbedBuilder().setTitle('Error').setDescription('No pude generar la gráfica inicial. Intenta más tarde.').setColor(COLORS.error)] });
    }

    // build embed with fresh metrics and image
    const embed = await buildEmbedWithImage(symbol, coinId, '24h', img24);
    const components = buildSelectMenu(coinId);

    // send message
    const sent = await msg.channel.send({ embeds: [embed], components });

    // schedule disable after TTL
    scheduleDisableComponents(sent);

    // background generate other images (non-blocking)
    generateRemainingImagesInBackground(coinId, symbol, '24h').catch(err => {
      console.error('cryptochart background generation error:', err && err.message ? err.message : err);
    });

    return;
  },

  // SLASH
  async executeInteraction(interaction) {
    const rem = checkCooldown(interaction.user.id);
    if (rem > 0) {
      const unlock = Math.floor((Date.now() + rem) / 1000);
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('Whoo! Vas muy rápido').setDescription(`Podrás volver a ejecutar este comando <t:${unlock}:R>.`).setColor(COLORS.error)], ephemeral: true });
    }

    const raw = (interaction.options.getString('moneda') || '').toLowerCase();
    if (!raw) return interaction.reply({ content: 'Debes indicar una moneda.', ephemeral: true });

    const coinId = resolveCoinId(raw);
    const symbol = raw;

    await interaction.deferReply(); // puede tardar en generar 24h

    try {
      const infoRes = await fetchWithRetries(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}?localization=false`);
      if (!infoRes.ok) return interaction.editReply({ embeds: [new EmbedBuilder().setTitle('Error').setDescription('Moneda no encontrada en CoinGecko.').setColor(COLORS.error)], ephemeral: true });
    } catch (e) {
      return interaction.editReply({ embeds: [new EmbedBuilder().setTitle('Error').setDescription('No pude contactar CoinGecko.').setColor(COLORS.error)], ephemeral: true });
    }

    cacheImages[coinId] = cacheImages[coinId] || { images: {}, createdAt: Date.now(), timeoutId: null };

    let img24 = cacheImages[coinId].images['24h'];
    try {
      if (!img24) {
        img24 = await generateImageForRange(coinId, symbol, '24h');
      }
    } catch (err) {
      console.error('cryptochart error generating initial 24h (slash):', err && err.message ? err.message : err);
      return interaction.editReply({ embeds: [new EmbedBuilder().setTitle('Error').setDescription('No pude generar la gráfica inicial. Intenta más tarde.').setColor(COLORS.error)], ephemeral: true });
    }

    const embed = await buildEmbedWithImage(symbol, coinId, '24h', img24);
    const components = buildSelectMenu(coinId);

    const replyMsg = await interaction.editReply({ embeds: [embed], components });
    try { scheduleDisableComponents(replyMsg); } catch (e) {}

    // background generate rest
    generateRemainingImagesInBackground(coinId, symbol, '24h').catch(err => console.error('cryptochart background generation error:', err && err.message ? err.message : err));

    return;
  },

  // HANDLE SELECT MENU INTERACTION
  async handleInteraction(interaction) {
    if (!interaction.isStringSelectMenu()) return;
    if (!interaction.customId?.startsWith('cryptochart_select:')) return;

    // no cooldown for switching ranges (user can change often), but we'll deferUpdate
    const symbolOrCoin = interaction.customId.split(':')[1];
    const symbol = symbolOrCoin;
    const coinId = resolveCoinId(symbol);

    const rangeId = interaction.values && interaction.values[0];
    if (!rangeId) return interaction.update({ content: 'Rango inválido', embeds: [], components: [] });

    await interaction.deferUpdate();

    // try to use cached image, otherwise generate now (fast path)
    let imageUrl = cacheImages[coinId]?.images?.[rangeId];
    if (!imageUrl) {
      try {
        imageUrl = await generateImageForRange(coinId, symbol, rangeId);
      } catch (err) {
        console.error(`cryptochart: error generating image for ${symbol} ${rangeId}:`, err && err.message ? err.message : err);
        // try fallback to 24h image if exists
        imageUrl = cacheImages[coinId]?.images?.['24h'] || null;
        if (!imageUrl) {
          return interaction.update({ content: 'No pude generar la gráfica para ese rango.', embeds: [], components: [] });
        }
      }
    }

    // build embed using fresh metrics but cached/generated image
    try {
      const embed = await buildEmbedWithImage(symbol, coinId, rangeId, imageUrl);
      const components = buildSelectMenu(coinId);
      return interaction.editReply ? interaction.editReply({ embeds: [embed], components }) : interaction.update({ embeds: [embed], components });
    } catch (err) {
      console.error('cryptochart handleInteraction error building embed:', err && err.message ? err.message : err);
      return interaction.editReply ? interaction.editReply({ content: 'Ocurrió un error al actualizar el embed.', embeds: [], components: [] }) : interaction.update({ content: 'Ocurrió un error al actualizar el embed.', embeds: [], components: [] });
    }
  }
};
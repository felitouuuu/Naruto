// commands/cryptochart.js
const {
  EmbedBuilder,
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} = require('discord.js');

// usa global fetch si existe (Node 18+). Si no, intenta node-fetch.
// (en tus contenedores modernos globalThis.fetch suele existir)
const fetch = globalThis.fetch || require('node-fetch');

const { COINS } = require('../utils/cryptoUtils');

const QUICKCHART_CREATE = 'https://quickchart.io/chart/create';
const COLORS = { main: '#6A0DAD', error: '#ED4245' };

const MAX_POINTS = 240;          // muestreo máximo de puntos para la serie
const IMAGE_CACHE_MS = 10 * 60 * 1000; // 10 minutos cache para imágenes y snapshot
const SELECT_EXPIRE_MS = 10 * 60 * 1000; // 10 minutos para desactivar select
const COOLDOWN_MS = 10 * 1000;  // 10s cooldown por usuario
const BG_DELAY_MS = 600;        // espera entre requests en background para evitar 429

// RANGOS finales: 1h, 24h, 7d, 30d, 120d (≈4 meses), 365d
const RANGES = [
  { id: '1h', label: 'Última hora' },
  { id: '24h', label: 'Último día' },
  { id: '7d', label: 'Últimos 7d' },
  { id: '30d', label: 'Últimos 30d' },
  { id: '120d', label: 'Últimos 4 meses' },
  { id: '365d', label: 'Último año' }
];

// Caches en memoria (server-side). Key: coinId (ej: 'bitcoin' o 'btc' resolved)
const CACHE = {
  // coinKey: {
  //   createdAt: Date.now(),
  //   images: { '24h': url, '7d': url, ... },
  //   snapshot: { market_data: {...}, fetchedAt: ts }  // snapshot guardada (se usa como fallback)
  // }
};
const COOLDOWNS = {}; // userId -> timestamp (ms)

// ---------- utilidades ----------
function money(n) { return n == null ? 'N/A' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function percent(n) { return n == null ? 'N/A' : `${Number(n).toFixed(2)}%`; }
function nowMs() { return Date.now(); }
function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }
function resolveCoinId(input) {
  if (!input) return null;
  const s = input.toLowerCase();
  return COINS[s] || s;
}

// fetch con reintentos simples y backoff. Maneja 429 respetando header Retry-After si viene.
async function fetchWithRetry(url, opts = {}, retries = 3, baseDelay = 600) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, opts);
      if (res.status === 429) {
        const ra = res.headers ? res.headers.get('retry-after') : null;
        const wait = ra ? Math.ceil(Number(ra) * 1000) : baseDelay * Math.pow(2, attempt);
        await sleep(wait + 200);
        continue;
      }
      if (!res.ok) {
        // For 5xx we retry; for 4xx (other than 429) we throw immediately
        if (res.status >= 500 && attempt < retries) {
          await sleep(baseDelay * Math.pow(2, attempt));
          continue;
        }
        throw new Error(`${url} -> ${res.status}`);
      }
      return res;
    } catch (err) {
      if (attempt >= retries) throw err;
      await sleep(baseDelay * Math.pow(2, attempt));
    }
  }
  throw new Error('fetchWithRetry exhausted');
}

// crea chart en QuickChart (POST /chart/create) con reintentos
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

  const body = { chart: cfg, backgroundColor: 'transparent', width: 1200, height: 420 };
  const res = await fetchWithRetry(QUICKCHART_CREATE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }, 3, 500);
  const json = await res.json();
  return json.url || null;
}

// obtiene market chart de CoinGecko (precios). Soporta '1h' con range endpoint.
async function fetchMarketData(coinId, rangeId) {
  const now = Math.floor(Date.now() / 1000);
  if (rangeId === '1h') {
    const from = now - 3600;
    const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}/market_chart/range?vs_currency=usd&from=${from}&to=${now}`;
    const res = await fetchWithRetry(url, { headers: { Accept: 'application/json' } }, 3, 600);
    const j = await res.json();
    if (!j.prices || !j.prices.length) return null;
    let prices = j.prices.map(p => ({ t: p[0], v: p[1] }));
    if (prices.length > MAX_POINTS) {
      const step = Math.ceil(prices.length / MAX_POINTS);
      prices = prices.filter((_, i) => i % step === 0);
    }
    return prices;
  }

  let days;
  if (rangeId === '24h') days = 1;
  else if (rangeId === '7d') days = 7;
  else if (rangeId === '30d') days = 30;
  else if (rangeId === '120d') days = 120;
  else if (rangeId === '365d') days = 365;
  else days = 1;

  const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}/market_chart?vs_currency=usd&days=${days}`;
  const res = await fetchWithRetry(url, { headers: { Accept: 'application/json' } }, 3, 600);
  const j = await res.json();
  if (!j.prices || !j.prices.length) return null;
  let prices = j.prices.map(p => ({ t: p[0], v: p[1] }));
  if (prices.length > MAX_POINTS) {
    const step = Math.ceil(prices.length / MAX_POINTS);
    prices = prices.filter((_, i) => i % step === 0);
  }
  return prices;
}

// obtiene resumen del coin (market_data)
async function fetchCoinSummary(coinId) {
  const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`;
  const res = await fetchWithRetry(url, { headers: { Accept: 'application/json' } }, 3, 600);
  return res.json();
}

// genera embed completo (imagen + campos) para coinId y rangeId.
// Si se pasa 'preferCachedImage' y existe cache.images[rangeId], se usa esa url.
// NOTA: este método pide snapshot fresco para las métricas (precio, change, etc.)
// pero si quieres ahorrar calls, puede usar snapshot de CACHE (como fallback) si CG falla.
async function buildEmbedForRange(symbol, coinId, rangeId, preferCachedImage = true) {
  // obtener (si existe) cache entry
  const cacheKey = coinId;
  const cacheEntry = CACHE[cacheKey];
  const now = nowMs();
  const images = cacheEntry?.images || {};

  // 1) traer imagen: si existe cached image y no expired, úsala; si no, generar
  let chartUrl = null;
  if (preferCachedImage && images[rangeId]) {
    chartUrl = images[rangeId];
  } else {
    // generar precios -> quickchart
    const prices = await fetchMarketData(coinId, rangeId);
    if (!prices || !prices.length) throw new Error('no-prices');
    const labels = prices.map(p => {
      const d = new Date(p.t);
      return `${d.toLocaleDateString('en-US')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    });
    const values = prices.map(p => Number(p.v));
    const first = values[0], last = values[values.length - 1];
    const changePct = first && first !== 0 ? ((last - first) / first * 100) : 0;
    const title = `${symbol.toUpperCase()} · ${money(last)} · ${Number(changePct).toFixed(2)}%`;

    chartUrl = await createQuickChartUrl(labels, values.map(v => Number(v.toFixed(8))), title).catch(err => { throw err; });
    // store into cacheEntry.images if there is a cache entry
    if (cacheEntry) {
      cacheEntry.images[rangeId] = chartUrl;
    } else {
      // if no cache entry, create lightweight temp
      CACHE[cacheKey] = { createdAt: now, images: { [rangeId]: chartUrl }, snapshot: null };
    }
  }

  // 2) fetch summary fresco para campos (price, marketcap, changes)
  let summary = null;
  try {
    summary = await fetchCoinSummary(coinId);
  } catch (err) {
    // si falla, usaremos snapshot guardada en cache si existe
    summary = cacheEntry?.snapshot?.summary || null;
  }

  // construir embed
  const md = summary?.market_data || null;
  const embed = new EmbedBuilder()
    .setTitle(`${symbol.toUpperCase()} — ${RANGES.find(r => r.id === rangeId)?.label || rangeId}`)
    .setDescription(`Último: **${md?.current_price?.usd ? money(md.current_price.usd) : 'N/A'}** • Cambio (desde inicio rango): **${md ? percent(((md.current_price.usd || 0) - (md.current_price?.usd || 0)) ) : 'N/A'}**`)
    .setColor(COLORS.main)
    .setImage(chartUrl)
    .setTimestamp();

  if (md) {
    const change1h = md.price_change_percentage_1h_in_currency?.usd ?? null;
    const change24 = md.price_change_percentage_24h_in_currency?.usd ?? null;
    const change7d = md.price_change_percentage_7d_in_currency?.usd ?? null;
    const marketCap = md.market_cap?.usd ?? null;
    const vol24 = md.total_volume?.usd ?? null;
    const ath = md.ath?.usd ?? null;
    const atl = md.atl?.usd ?? null;

    embed.addFields(
      { name: 'Market cap', value: marketCap ? money(marketCap) : 'N/A', inline: true },
      { name: 'Price', value: md.current_price?.usd ? money(md.current_price.usd) : 'N/A', inline: true },
      { name: 'Change 1h', value: change1h !== null ? `${change1h >= 0 ? '🔺' : '🔻'} ${percent(change1h)}` : 'N/A', inline: true },
      { name: 'Change 24h', value: change24 !== null ? `${change24 >= 0 ? '🔺' : '🔻'} ${percent(change24)}` : 'N/A', inline: true },
      { name: 'Change 7d', value: change7d !== null ? `${change7d >= 0 ? '🔺' : '🔻'} ${percent(change7d)}` : 'N/A', inline: true },
      { name: 'ATH', value: ath ? money(ath) : 'N/A', inline: true },
      { name: 'ATL', value: atl ? money(atl) : 'N/A', inline: true }
    );

    if (summary.image?.large) embed.setThumbnail(summary.image.large);
  } else {
    embed.addFields({ name: 'Fuente', value: 'CoinGecko (resumen no disponible)', inline: true });
  }

  // store snapshot in cache
  CACHE[cacheKey] = CACHE[cacheKey] || { createdAt: now, images: {} };
  CACHE[cacheKey].snapshot = { summary, fetchedAt: now };

  return { embed, chartUrl, summary };
}

// background: genera todas las imágenes (excepto 24h si ya existe) y las cachea.
// se ejecuta en background con delays para evitar 429. No bloquea respuesta al usuario.
async function generateAllChartsInBackground(symbol, coinId) {
  const key = coinId;
  CACHE[key] = CACHE[key] || { createdAt: nowMs(), images: {}, snapshot: null };

  for (const r of RANGES) {
    try {
      // si ya existe y no expiró, saltar
      const existing = CACHE[key].images?.[r.id];
      const expired = CACHE[key].createdAt && (nowMs() - CACHE[key].createdAt > IMAGE_CACHE_MS);
      if (existing && !expired) {
        // skip
      } else {
        // small delay to reduce rate of requests
        await sleep(BG_DELAY_MS);
        const prices = await fetchMarketData(coinId, r.id);
        if (!prices || !prices.length) {
          console.log(`cryptochart: no prices for ${coinId} ${r.id}`);
          continue;
        }
        const labels = prices.map(p => {
          const d = new Date(p.t);
          return `${d.toLocaleDateString('en-US')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
        });
        const values = prices.map(p => Number(p.v));
        const first = values[0], last = values[values.length - 1];
        const title = `${symbol.toUpperCase()} · ${money(last)} · ${Number(((last - first) / (first || last || 1) * 100)).toFixed(2)}%`;

        // Create chart (with retries inside createQuickChartUrl)
        const url = await createQuickChartUrl(labels, values.map(v => Number(v.toFixed(8))), title).catch(err => {
          console.warn(`cryptochart: error generating image for ${coinId} ${r.id}:`, err.message || err);
          return null;
        });
        if (url) {
          CACHE[key].images[r.id] = url;
          CACHE[key].createdAt = nowMs();
        }
      }
    } catch (err) {
      console.warn('cryptochart: bg error for', coinId, r.id, err?.message || err);
      // continue background for other ranges
    }
  }

  // refresh and store snapshot summary once
  try {
    const summary = await fetchCoinSummary(coinId);
    CACHE[key].snapshot = { summary, fetchedAt: nowMs() };
  } catch (e) {
    // ignore
  }

  // set expiry cleanup after IMAGE_CACHE_MS
  setTimeout(() => {
    const entry = CACHE[key];
    if (!entry) return;
    if (nowMs() - (entry.createdAt || 0) >= IMAGE_CACHE_MS) {
      delete CACHE[key];
    }
  }, IMAGE_CACHE_MS + 1000);
}

// Construye select menu (1 single row)
function buildSelectMenu(symbol) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`cryptochart_select:${symbol}`)
    .setPlaceholder('Selecciona rango')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(RANGES.map(r => ({ label: r.label, value: r.id })));
  return [ new ActionRowBuilder().addComponents(menu) ];
}

// cooldown simple por usuario
function checkAndSetCooldown(userId) {
  const last = COOLDOWNS[userId] || 0;
  const diff = nowMs() - last;
  if (diff < COOLDOWN_MS) return COOLDOWN_MS - diff;
  COOLDOWNS[userId] = nowMs();
  return 0;
}

// ---------- EXPORT COMMAND ----------
module.exports = {
  name: 'cryptochart',
  description: 'Muestra gráfico y métricas avanzadas de una moneda (menú de rangos).',
  category: 'Criptos',
  ejemplo: 'cryptochart btc',
  syntax: '!cryptochart <moneda>',

  data: new SlashCommandBuilder()
    .setName('cryptochart')
    .setDescription('Muestra gráfica de precio con rangos')
    .addStringOption(opt => opt.setName('moneda').setDescription('btc, eth, sol, bnb, xrp, doge (o id)').setRequired(true)),

  // PREFIJO
  async executeMessage(msg, args) {
    try {
      const remaining = checkAndSetCooldown(msg.author.id);
      if (remaining > 0) {
        const unlock = Math.floor((Date.now() + remaining) / 1000);
        return msg.reply({ embeds: [ new EmbedBuilder().setTitle('Vas rápido').setDescription(`Intenta de nuevo <t:${unlock}:R>`).setColor(COLORS.error) ] });
      }

      const raw = (args[0] || '').toLowerCase();
      if (!raw) return msg.channel.send({ embeds: [ new EmbedBuilder().setTitle('Uso').setDescription('Ej: `!cryptochart btc`').setColor(COLORS.error) ] });

      const coinId = resolveCoinId(raw);
      const symbol = raw;

      // responder rápido: defer-like (mensaje provisional)
      const generatingMsg = await msg.channel.send({ content: 'Generando gráfica 24h… esto puede tardar unos segundos' });

      // 1) generar 24h sincronamente (importante: evitar timeouts)
      let firstEmbed;
      try {
        // use preferCachedImage = false to force generating 24h fresh (and store)
        const { embed } = await buildEmbedForRange(symbol, coinId, '24h', false);
        firstEmbed = embed;
      } catch (err) {
        console.error('cryptochart error (msg 24h):', err);
        await generatingMsg.edit({ content: '', embeds: [ new EmbedBuilder().setTitle('Error').setDescription('No pude generar la gráfica 24h para esa moneda.').setColor(COLORS.error) ] }).catch(()=>{});
        return;
      }

      // send message with select menu
      const rows = buildSelectMenu(symbol);
      const sent = await generatingMsg.edit({ content: '', embeds: [firstEmbed], components: rows }).catch(async (e) => {
        // fallback: try sending fresh message
        return msg.channel.send({ embeds: [firstEmbed], components: rows });
      });

      // schedule background generation of other ranges (non-blocking)
      generateAllChartsInBackground(symbol, coinId).catch(err => {
        console.warn('cryptochart: background generation failed', err?.message || err);
      });

      // schedule disabling the select after SELECT_EXPIRE_MS
      setTimeout(async () => {
        try {
          const m = sent?.id ? sent : null;
          const messageObj = sent && sent.edit ? sent : undefined;
          if (messageObj) {
            // remove components
            await messageObj.edit({ components: [] }).catch(() => {});
          }
        } catch (e) {}
      }, SELECT_EXPIRE_MS);

    } catch (err) {
      console.error('cryptochart executeMessage err:', err);
      return msg.channel.send({ embeds: [ new EmbedBuilder().setTitle('Error').setDescription('Ocurrió un error interno generando la gráfica.').setColor(COLORS.error) ] });
    }
  },

  // SLASH
  async executeInteraction(interaction) {
    try {
      // cooldown
      const remaining = checkAndSetCooldown(interaction.user.id);
      if (remaining > 0) {
        const unlock = Math.floor((Date.now() + remaining) / 1000);
        return interaction.reply({ embeds: [ new EmbedBuilder().setTitle('Vas rápido').setDescription(`Intenta de nuevo <t:${unlock}:R>`).setColor(COLORS.error) ], ephemeral: true });
      }

      const raw = (interaction.options.getString('moneda') || '').toLowerCase();
      if (!raw) return interaction.reply({ embeds: [ new EmbedBuilder().setTitle('Uso').setDescription('Ej: `/cryptochart moneda:btc`').setColor(COLORS.error) ], ephemeral: true });

      const coinId = resolveCoinId(raw);
      const symbol = raw;

      await interaction.deferReply(); // evita timeout

      // generar 24h sync
      let firstEmbed;
      try {
        const { embed } = await buildEmbedForRange(symbol, coinId, '24h', false);
        firstEmbed = embed;
      } catch (err) {
        console.error('cryptochart error (slash 24h):', err);
        return interaction.editReply({ embeds: [ new EmbedBuilder().setTitle('Error').setDescription('No pude generar la gráfica 24h para esa moneda.').setColor(COLORS.error) ] });
      }

      // responder con embed + select
      const rows = buildSelectMenu(symbol);
      const replyMsg = await interaction.editReply({ embeds: [firstEmbed], components: rows }).catch(async () => {
        // fallback: try reply simple
        return interaction.followUp({ embeds: [firstEmbed], components: rows });
      });

      // background generate others
      generateAllChartsInBackground(symbol, coinId).catch(err => {
        console.warn('cryptochart: background generation failed', err?.message || err);
      });

      // plan para desactivar componentes a los 10 min
      setTimeout(async () => {
        try {
          // intentar editar el mensaje y quitar componentes
          const m = replyMsg?.id ? replyMsg : null;
          const messageObj = replyMsg && replyMsg.edit ? replyMsg : undefined;
          if (messageObj) {
            await messageObj.edit({ components: [] }).catch(() => {});
          }
        } catch (e) {}
      }, SELECT_EXPIRE_MS);

    } catch (err) {
      console.error('cryptochart executeInteraction err:', err);
      return interaction.reply({ embeds: [ new EmbedBuilder().setTitle('Error').setDescription('Ocurrió un error interno generando la gráfica.').setColor(COLORS.error) ], ephemeral: true });
    }
  },

  // Manejo de select menu
  async handleInteraction(interaction) {
    try {
      if (!interaction.isStringSelectMenu()) return;
      if (!interaction.customId?.startsWith('cryptochart_select:')) return;

      // extraer symbol y range
      const symbol = interaction.customId.split(':')[1];
      const rangeId = interaction.values[0];
      const coinId = resolveCoinId(symbol);

      // deferUpdate para evitar timeout
      await interaction.deferUpdate();

      // intentar usar cache para la imagen y generar la embed (pero actualizar snapshot fresco)
      const cacheEntry = CACHE[coinId];
      const imageExists = cacheEntry && cacheEntry.images && cacheEntry.images[rangeId];
      let preferCached = !!imageExists;

      // build embed using preferCachedImage if available (that avoids re-creating chart)
      try {
        const result = await buildEmbedForRange(symbol, coinId, rangeId, preferCached);
        const embed = result.embed;
        const rows = buildSelectMenu(symbol);
        // actualizar mensaje original (mensaje en canal) con new embed + same select
        await interaction.editReply({ embeds: [embed], components: rows }).catch(async (e) => {
          // si editReply falla (por ejemplo no es reply), intentar interaction.message.edit
          try { await interaction.message.edit({ embeds: [embed], components: rows }); } catch {}
        });
        return;
      } catch (err) {
        console.error('cryptochart handleInteraction error:', err?.message || err);
        // si preferCached true y falló (ej: cache corrupta), intentar generar sin cached (forzar)
        if (preferCached) {
          try {
            const result = await buildEmbedForRange(symbol, coinId, rangeId, false);
            const embed = result.embed;
            const rows = buildSelectMenu(symbol);
            await interaction.editReply({ embeds: [embed], components: rows }).catch(async () => {
              try { await interaction.message.edit({ embeds: [embed], components: rows }); } catch {}
            });
            return;
          } catch (err2) {
            console.error('cryptochart handleInteraction fallback failed:', err2?.message || err2);
          }
        }
        // en última instancia, informar error y mantener componentes
        try {
          await interaction.followUp({ embeds: [ new EmbedBuilder().setTitle('Error').setDescription('No pude generar la gráfica para ese rango. Intenta más tarde.').setColor(COLORS.error) ], ephemeral: true });
        } catch (e) {}
      }
    } catch (err) {
      console.error('cryptochart handleInteraction outer err:', err);
    }
  }
};
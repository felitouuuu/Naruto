// carnaval.js
const { MessageEmbed } = require('discord.js');
const stringSimilarity = require('string-similarity');

const TARGET_CHANNEL = '1390187635888095346';
const LOG_CHANNEL = '1424039114537308222';
const PING_USER_ID = '1003512479277662208';

const UMBRAL = 0.19;
const IGNORED_USER_ID = '1401311520939446342';

// =========================
// Frases representativas (solo Luna)
// =========================
const CLIMAS_FRASES = {
  luna: [
    '🌕', 'luna de sangre', 'la luna carmesí ilumina la noche',
    'todo parece inquieto bajo su influjo oscuro'
  ]
};

// =========================
// Embed Luna
// =========================
const CLIMAS_EMBED = {
  luna: () => {
    const oneHourLater = Math.floor(Date.now() / 1000) + 3600;
    return new MessageEmbed()
      .setTitle('🌑 El clima de Luna de Sangre 🩸 esta activo.')
      .setDescription('*La luna carmesí ilumina la noche. Todo parece inquieto bajo su influjo oscuro.*')
      .addField('⏱️ Tiempo Restante', `<t:${oneHourLater}:R>`)
      .addField('🚀 Mejora', 'El clima despierta y ha potenciado la actividad **Aventuras**.')
      .addField('🎡 Carnaval', 'Usa `!pet explore` para aprovechar el carnaval y ganar más premios.')
      .setColor('#8B0000')
      .setThumbnail('https://cdn.discordapp.com/attachments/1097327580476080178/1424142544815526029/1_1003512479277662208_nk-dream.png?ex=68e2df99&is=68e18e19&hm=c6ed1a0b7f4d2b0d230b5199dc53ec999f880879ec6aa15e49b0a71df2d52d1b&');
  }
};

// =========================
// Utils
// =========================
function normalizeText(s = '') {
  return (s || '')
    .toLowerCase()
    .replace(/[`*_>~|••—–—…]/g, ' ')
    .replace(/<a?:\w+:\d+>/g, ' ')
    .replace(/http[^\s]+/g, ' ')
    .replace(/[^a-z0-9áéíóúüñ🌕\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeWords(s = '') {
  return (s || '').split(/\s+/).filter(Boolean);
}

function jaccardScore(a = '', b = '') {
  const sa = new Set(tokenizeWords(a));
  const sb = new Set(tokenizeWords(b));
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  const uni = new Set([...sa, ...sb]).size;
  return inter / uni;
}

function collectStringsDeep(obj, out = [], seen = new Set()) {
  if (obj == null) return out;
  if (typeof obj === 'string') {
    const t = obj.trim();
    if (t) out.push(t);
    return out;
  }
  if (typeof obj === 'number' || typeof obj === 'boolean') return out;
  if (seen.has(obj)) return out;
  if (typeof obj === 'object') {
    seen.add(obj);
    if (Array.isArray(obj)) {
      for (const v of obj) collectStringsDeep(v, out, seen);
      return out;
    }
    for (const k of Object.keys(obj)) {
      try { collectStringsDeep(obj[k], out, seen); } catch (e) {}
    }
  }
  return out;
}

function extractTextFromEmbeds(embeds = []) {
  if (!Array.isArray(embeds) || embeds.length === 0) return '';
  const parts = [];
  for (const embed of embeds) {
    if (!embed) continue;
    if (typeof embed.title === 'string') parts.push(embed.title);
    if (typeof embed.description === 'string') parts.push(embed.description);
    if (embed.author && typeof embed.author.name === 'string') parts.push(embed.author.name);
    if (embed.footer && typeof embed.footer.text === 'string') parts.push(embed.footer.text);
    if (Array.isArray(embed.fields)) {
      for (const f of embed.fields) {
        if (typeof f.name === 'string') parts.push(f.name);
        if (typeof f.value === 'string') parts.push(f.value);
      }
    }
    // Recoger otras cadenas anidadas por seguridad
    const deep = collectStringsDeep(embed);
    for (const s of deep) if (!parts.includes(s)) parts.push(s);
  }
  return parts.join(' ');
}

/**
 * Mejor similitud comparando la frase (nf) contra ventanas (sub-frases)
 * dentro del texto completo. Esto mejora detección cuando la frase
 * aparece dentro de descripciones largas o en polls/reenvíos.
 */
function bestSubstringSimilarity(text = '', phrase = '') {
  const nt = normalizeText(text);
  const np = normalizeText(phrase);
  if (!nt || !np) return 0;

  // si la frase completa ya está incluida → 1
  if (nt.includes(np)) return 1;

  const wordsT = tokenizeWords(nt);
  const wordsP = tokenizeWords(np);
  if (wordsT.length === 0 || wordsP.length === 0) return 0;

  const targetWindow = Math.max(1, wordsP.length);
  const minWindow = Math.max(1, targetWindow - 1);
  const maxWindow = Math.min(wordsT.length, targetWindow + 2);

  let best = 0;
  for (let w = minWindow; w <= maxWindow; w++) {
    for (let i = 0; i + w <= wordsT.length; i++) {
      const windowText = wordsT.slice(i, i + w).join(' ');
      const r = stringSimilarity.compareTwoStrings(windowText, np);
      if (r > best) best = r;
      if (best === 1) return 1;
    }
  }
  return best;
}

// =========================
// Comparación robusta entre texto y frases
// devuelve { frase, score }
function analyzeAgainstPhrases(text, frases) {
  const normalizedText = normalizeText(text || '');
  let best = { frase: null, score: 0 };

  for (const f of frases) {
    const nf = normalizeText(f);

    // coincidencia literal rápida
    if (!nf) continue;
    if (normalizedText === nf || normalizedText.includes(nf)) return { frase: f, score: 1 };

    // comparación completa
    const scoreFull = stringSimilarity.compareTwoStrings(normalizedText, nf);

    // comparación por substring/window (mejora en textos largos)
    const scoreSub = bestSubstringSimilarity(normalizedText, nf);

    // similitud por tokens (Jaccard) - útil si comparten palabras
    const scoreJ = jaccardScore(normalizedText, nf);

    // combinar: tomar la mejor de las métricas (podés ajustar pesos si quieres)
    const combined = Math.max(scoreFull, scoreSub, scoreJ * 0.95);

    if (combined > best.score) best = { frase: f, score: combined };
  }

  return best;
}

// =========================
// Analizar mensaje (robusto — cubre embeds, attachments, stickers, components, referenced/fetched)
async function analyzeMessageFields(msg) {
  const candidates = [];
  // 1) prioridad: cleanContent (limpio ya por discord)
  if (typeof msg.cleanContent === 'string' && msg.cleanContent.trim()) candidates.push({ source: 'cleanContent', text: msg.cleanContent });

  // 2) content directo
  if (typeof msg.content === 'string' && msg.content.trim()) candidates.push({ source: 'content', text: msg.content });

  // 3) embeds (cada embed como candidato)
  if (Array.isArray(msg.embeds) && msg.embeds.length) {
    for (let i = 0; i < msg.embeds.length; i++) {
      const extracted = extractTextFromEmbeds([msg.embeds[i]]);
      if (extracted && extracted.trim()) candidates.push({ source: `embed[${i}]`, text: extracted });
    }
  }

  // 4) attachments (nombres / descripciones)
  if (msg.attachments && typeof msg.attachments.forEach === 'function') {
    msg.attachments.forEach((att) => {
      const parts = [];
      if (att.name) parts.push(att.name);
      if (att.description) parts.push(att.description);
      if (parts.length) candidates.push({ source: `attachment:${att.id}`, text: parts.join(' ') });
    });
  }

  // 5) stickers
  if (msg.stickers && typeof msg.stickers.forEach === 'function') {
    msg.stickers.forEach((st) => {
      if (st && st.name) candidates.push({ source: `sticker:${st.id}`, text: st.name });
    });
  }

  // 6) components (botones/selects) - extraer texto recursivamente
  if (Array.isArray(msg.components) && msg.components.length) {
    const compsText = collectStringsDeep(msg.components).join(' ');
    if (compsText.trim()) candidates.push({ source: 'components', text: compsText });
  }

  // 7) interaction (si existe)
  if (msg.interaction) {
    const interText = collectStringsDeep(msg.interaction).join(' ');
    if (interText.trim()) candidates.push({ source: 'interaction', text: interText });
  }

  // 8) mensaje referenciado directo (si está presente)
  if (msg.referencedMessage) {
    try {
      const rm = msg.referencedMessage;
      if (rm.content && rm.content.trim()) candidates.push({ source: 'referenced.content', text: rm.content });
      const embRef = extractTextFromEmbeds(rm.embeds || []);
      if (embRef && embRef.trim()) candidates.push({ source: 'referenced.embeds', text: embRef });
      const deepRef = collectStringsDeep(rm).join(' ');
      if (deepRef.trim()) candidates.push({ source: 'referenced.deep', text: deepRef });
    } catch (e) {}
  } else if (msg.reference && msg.reference.messageId) {
    // intentar fetch si no está en cache
    try {
      const refChannelId = msg.reference.channelId || msg.channel.id;
      const refChannel = await msg.client.channels.fetch(refChannelId).catch(() => null);
      if (refChannel) {
        const fetched = await refChannel.messages.fetch(msg.reference.messageId).catch(() => null);
        if (fetched) {
          if (fetched.content && fetched.content.trim()) candidates.push({ source: 'fetchedReferenced.content', text: fetched.content });
          const embText = extractTextFromEmbeds(fetched.embeds || []);
          if (embText && embText.trim()) candidates.push({ source: 'fetchedReferenced.embeds', text: embText });
          const deepFetched = collectStringsDeep(fetched).join(' ');
          if (deepFetched.trim()) candidates.push({ source: 'fetchedReferenced.deep', text: deepFetched });
        }
      }
    } catch (e) {}
  }

  // 9) toJSON deep extraction (cubre campos raros)
  try {
    if (typeof msg.toJSON === 'function') {
      const jsonObj = msg.toJSON();
      const allStrings = collectStringsDeep(jsonObj).join(' ');
      if (allStrings && allStrings.trim()) candidates.push({ source: 'toJSON.deep', text: allStrings });
    }
  } catch (e) {}

  // 10) author, webhook id como último recurso
  if (msg.author && msg.author.username) candidates.push({ source: 'author.username', text: msg.author.username });
  if (msg.webhookID) candidates.push({ source: 'webhookID', text: `webhook:${msg.webhookID}` });

  // deduplicate small identical texts, preserve order
  const seen = new Set();
  const uniq = [];
  for (const c of candidates) {
    const t = (c.text || '').trim();
    if (!t) continue;
    const key = t.slice(0, 300); // recortar para comparar
    if (!seen.has(key)) { seen.add(key); uniq.push(c); }
  }

  if (uniq.length === 0) return { best: null, text: '' };

  // analizar cada candidato y tomar la mejor coincidencia frente a las frases de 'luna'
  const results = [];
  for (const c of uniq) {
    const text = String(c.text || '');
    const res = analyzeAgainstPhrases(text, CLIMAS_FRASES.luna);
    results.push({
      source: c.source,
      text,
      climate: res.frase ? 'luna' : null,
      score: res.score,
      matchPhrase: res.frase
    });
  }

  // ordenar por score descendente y devolver el mejor
  results.sort((a, b) => (b.score || 0) - (a.score || 0));
  const best = results[0] || null;
  return { best, text: best ? best.text : '' };
}

// =========================
// Logging en Embed Halloween (v12)
async function sendLog(client, payload) {
  const ch = client.channels.cache.get(LOG_CHANNEL) || await client.channels.fetch(LOG_CHANNEL).catch(() => null);
  if (!ch) return;

  const logEmbed = new MessageEmbed()
    .setTitle('📩 Mensaje Analizado — Carnaval (Halloween)')
    .setColor('#8B0000')
    .addField('Coincidencia', `${((payload.bestScore || 0) * 100).toFixed(1)}%`, true)
    .addField('Fuente', payload.source || 'unknown', true)
    .addField('Texto Analizado', payload.text || '(vacío)')
    .setTimestamp();

  // discord.js v12: enviar embed como primer argumento
  await ch.send(logEmbed).catch(() => {});
}

// =========================
// Alerta carnaval (solo Luna)
let carnavalActivo = false;
const carnavalProcessed = new Set();

async function sendCarnavalAlert(channel, client) {
  if (carnavalActivo) return;
  carnavalActivo = true;
  try {
    await channel.send({ content: `<@${PING_USER_ID}>`, allowedMentions: { users: [PING_USER_ID] } });
    await channel.send(CLIMAS_EMBED.luna());
  } finally {
    setTimeout(() => { carnavalActivo = false; }, 5000);
  }
}

// =========================
// Manejo de mensajes
async function handleMessage(msg) {
  try {
    if (!msg || !msg.channel || msg.channel.id !== TARGET_CHANNEL) return;
    if ((msg.author && String(msg.author.id) === IGNORED_USER_ID) || (msg.webhookID && String(msg.webhookID) === IGNORED_USER_ID)) return;
    if (carnavalProcessed.has(msg.id)) return;

    const analysis = await analyzeMessageFields(msg);
    const best = analysis.best;

    // enviar log (incluye campo source para ver de dónde vino)
    await sendLog(msg.client, {
      text: analysis.text,
      bestScore: best ? best.score : 0,
      source: msg.webhookID ? `webhook:${msg.webhookID}` : (msg.author ? (msg.author.tag || msg.author.username) : 'unknown')
    });

    if (best && best.score >= UMBRAL) {
      carnavalProcessed.add(msg.id);
      await sendCarnavalAlert(msg.channel, msg.client);
    }
  } catch (err) {
    console.error('Error en handleMessage:', err);
  }
}

module.exports = { handleMessage };
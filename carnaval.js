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
    '🌕', 
    'luna de sangre', 
    'la luna carmesí ilumina la noche',
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

function collectStringsDeep(obj, out = [], seen = new Set()) {
  if (obj == null) return out;
  if (typeof obj === 'string') {
    const t = obj.trim();
    if (t) out.push(t);
    return out;
  }
  if (typeof obj === 'object' && !seen.has(obj)) {
    seen.add(obj);
    if (Array.isArray(obj)) {
      for (const v of obj) collectStringsDeep(v, out, seen);
    } else {
      for (const k of Object.keys(obj)) collectStringsDeep(obj[k], out, seen);
    }
  }
  return out;
}

function extractTextFromEmbeds(embeds = []) {
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
    const deep = collectStringsDeep(embed);
    for (const s of deep) if (!parts.includes(s)) parts.push(s);
  }
  return parts.join(' ');
}

// =========================
// Nueva versión robusta
// =========================
function analyzeAgainstPhrases(text, frases) {
  const normalizedText = normalizeText(text);

  let best = { frase: null, score: 0 };

  for (const f of frases) {
    const nf = normalizeText(f);

    // 🔴 Coincidencia exacta o inclusión fuerte
    if (normalizedText === nf || normalizedText.includes(nf)) {
      return { frase: f, score: 1 }; // 100%
    }

    // 🟡 Similaridad por tramos (palabras separadas)
    const words = nf.split(/\s+/);
    let matches = 0;
    for (const w of words) {
      if (normalizedText.includes(w)) matches++;
    }
    const ratio = matches / words.length;

    // 🟢 string-similarity clásico
    const rating = stringSimilarity.compareTwoStrings(normalizedText, nf);

    // Tomamos lo mejor entre similitud por palabras y similitud global
    const finalScore = Math.max(ratio, rating);

    if (finalScore > best.score) {
      best = { frase: f, score: finalScore };
    }
  }

  return best;
}

// =========================
// Analizar mensaje (solo Luna)
// =========================
async function analyzeMessageFields(msg) {
  const candidates = [];

  if (msg.cleanContent) candidates.push(msg.cleanContent);
  if (msg.content) candidates.push(msg.content);
  if (Array.isArray(msg.embeds)) {
    for (const e of msg.embeds) {
      const extracted = extractTextFromEmbeds([e]);
      if (extracted) candidates.push(extracted);
    }
  }
  if (msg.referencedMessage) {
    if (msg.referencedMessage.content) candidates.push(msg.referencedMessage.content);
    const emb = extractTextFromEmbeds(msg.referencedMessage.embeds || []);
    if (emb) candidates.push(emb);
  }

  if (candidates.length === 0) return { best: null, text: '' };

  let best = { clima: null, score: 0, frase: null, text: '' };
  for (const c of candidates) {
    const res = analyzeAgainstPhrases(c, CLIMAS_FRASES.luna);
    if (res.score > best.score) {
      best = { clima: 'luna', score: res.score, frase: res.frase, text: c };
    }
  }

  return { best, text: best.text };
}

// =========================
// Logging en Embed Halloween
// =========================
async function sendLog(client, payload) {
  const ch = client.channels.cache.get(LOG_CHANNEL) || await client.channels.fetch(LOG_CHANNEL).catch(() => null);
  if (!ch) return;

  const logEmbed = new MessageEmbed()
    .setTitle('📩 Mensaje Analizado — Carnaval (Halloween)')
    .setColor('#8B0000')
    .addField('Coincidencia', `${((payload.bestScore || 0) * 100).toFixed(1)}%`, true)
    .addField('Texto Analizado', payload.text || '(vacío)')
    .setTimestamp();

  await ch.send(logEmbed).catch(() => {});
}

// =========================
// Alerta carnaval (solo Luna)
// =========================
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
// =========================
async function handleMessage(msg) {
  try {
    if (!msg.channel || msg.channel.id !== TARGET_CHANNEL) return;
    if ((msg.author && String(msg.author.id) === IGNORED_USER_ID) || (msg.webhookID && String(msg.webhookID) === IGNORED_USER_ID)) return;
    if (carnavalProcessed.has(msg.id)) return;

    const analysis = await analyzeMessageFields(msg);
    const best = analysis.best;

    await sendLog(msg.client, {
      text: analysis.text,
      bestScore: best ? best.score : 0
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
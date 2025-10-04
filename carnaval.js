// carnaval.js
const { MessageEmbed } = require('discord.js');
const stringSimilarity = require('string-similarity');

const TARGET_CHANNEL = '1390187635888095346';
const LOG_CHANNEL = '1424039114537308222';
const PING_USER_ID = '1003512479277662208';

const UMBRAL = 0.70;

// =========================
// Frases representativas por clima
// =========================
const CLIMAS_FRASES = {
  vientos: [
    '💨', 'vientos embrujados', 'el aire lleva susurros y carcajadas lejanas',
    'tu mascota se guía por corrientes misteriosas hacia hallazgos prohibidos',
    'corrientes misteriosas', 'exploración'
  ],
  niebla: [
    '👻', 'niebla tenebrosa', 'una densa bruma cubre el lago',
    'sombras extrañas se mueven bajo la superficie', 'minería'
  ],
  lluvia: [
    '🌧️', '🌧', 'lluvia maldita', 'las gotas golpean el agua como si susurraran conjuros',
    'los peces emergen atraídos por lo desconocido', 'pesca'
  ],
  luna: [
    '🌕', 'luna de sangre', 'la luna carmesí ilumina la noche',
    'todo parece inquieto bajo su influjo oscuro'
  ]
};

// =========================
// Embeds builders
// =========================
const CLIMAS_EMBED = {
  vientos: () => {
    const oneHourLater = Math.floor(Date.now() / 1000) + 3600;
    return new MessageEmbed()
      .setTitle('💨 El clima ha cambiado a Vientos Embrujados')
      .setDescription('*El aire lleva susurros y carcajadas lejanas. Tu mascota se guía por corrientes misteriosas hacia hallazgos prohibidos.*')
      .addField('⏱️ Tiempo Restante', `<t:${oneHourLater}:R>`)
      .addField('🚀 Mejora', 'Potencia la actividad **Exploración**.')
      .setColor('#6A5ACD');
  },
  niebla: () => {
    const oneHourLater = Math.floor(Date.now() / 1000) + 3600;
    return new MessageEmbed()
      .setTitle('👻 El clima ha cambiado a Niebla Tenebrosa')
      .setDescription('*Una densa bruma cubre el lago. Sombras extrañas se mueven bajo la superficie.*')
      .addField('⏱️ Tiempo Restante', `<t:${oneHourLater}:R>`)
      .addField('🚀 Mejora', 'Potencia la actividad **Minería**.')
      .setColor('#708090');
  },
  lluvia: () => {
    const oneHourLater = Math.floor(Date.now() / 1000) + 3600;
    return new MessageEmbed()
      .setTitle('🌧️ El clima ha cambiado a Lluvia Maldita')
      .setDescription('*Las gotas golpean el agua como si susurraran conjuros. Los peces emergen, atraídos por lo desconocido.*')
      .addField('⏱️ Tiempo Restante', `<t:${oneHourLater}:R>`)
      .addField('🚀 Mejora', 'Potencia la actividad **Pesca**.')
      .setColor('#483D8B');
  },
  luna: () => {
    const oneHourLater = Math.floor(Date.now() / 1000) + 3600;
    return new MessageEmbed()
      .setTitle('🌕 El clima ha cambiado a Luna de Sangre')
      .setDescription('*La luna carmesí ilumina la noche. Todo parece inquieto bajo su influjo oscuro.*')
      .addField('⏱️ Tiempo Restante', `<t:${oneHourLater}:R>`)
      .addField('🚀 Mejora', 'Potencia la actividad **Aventuras**.')
      .setColor('#8B0000');
  }
};

// =========================
// Normalización de texto
// =========================
function normalizeText(s = '') {
  return (s || '')
    .toLowerCase()
    .replace(/[`*_>~|••—–—…]/g, ' ')
    .replace(/<a?:\w+:\d+>/g, ' ')
    .replace(/http[^\s]+/g, ' ')
    .replace(/[^a-z0-9áéíóúüñ🌧️🌧🌕💨👻\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// =========================
// Extract text from embeds robustamente
// =========================
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
      for (const field of embed.fields) {
        if (typeof field.name === 'string') parts.push(field.name);
        if (typeof field.value === 'string') parts.push(field.value);
      }
    }
    // Recorre otras propiedades por seguridad
    for (const key of Object.keys(embed)) {
      if (['title','description','author','footer','fields'].includes(key)) continue;
      const val = embed[key];
      if (typeof val === 'string' && val.trim()) parts.push(val);
    }
  }

  return parts.join(' ');
}

// =========================
// Extrae emojis relevantes (busca sólo los que usamos como pistas)
// =========================
function detectClimateEmoji(text = '') {
  if (!text) return null;
  const map = [
    { key: 'lluvia', emojis: ['🌧️', '🌧'] },
    { key: 'luna', emojis: ['🌕'] },
    { key: 'vientos', emojis: ['💨'] },
    { key: 'niebla', emojis: ['👻'] }
  ];
  for (const m of map) {
    for (const e of m.emojis) {
      if (text.includes(e)) return m.key;
    }
  }
  return null;
}

// =========================
// Analizar texto con string-similarity y coincidencia idéntica
// =========================
function analyzeAgainstPhrases(text, frases) {
  if (!text || !frases || frases.length === 0) return { frase: null, score: 0 };

  const normalizedText = normalizeText(text);
  let best = { frase: null, score: 0 };

  for (const f of frases) {
    const nf = normalizeText(f);

    // Coincidencia exacta literal
    if (normalizedText === nf || normalizedText.includes(nf)) return { frase: f, score: 1 };

    // Sino usa string-similarity
    const rating = stringSimilarity.compareTwoStrings(normalizedText, nf);
    if (rating > best.score) best = { frase: f, score: rating };
  }

  return best;
}

// =========================
// Analiza múltiples campos (content + cada campo de embed) y devuelve el mejor resultado con detalle
// =========================
function analyzeMessageFields(msg) {
  const candidates = [];

  // Campo 1: contenido directo del mensaje
  if (typeof msg.content === 'string' && msg.content.trim().length > 0) {
    candidates.push({ source: 'content', text: msg.content });
  }

  // Extraer campos individuales de embeds
  if (Array.isArray(msg.embeds)) {
    for (let i = 0; i < msg.embeds.length; i++) {
      const embed = msg.embeds[i];
      if (!embed) continue;

      const parts = [];

      if (embed.title) parts.push(embed.title);
      if (embed.description) parts.push(embed.description);
      if (embed.author && embed.author.name) parts.push(embed.author.name);
      if (embed.footer && embed.footer.text) parts.push(embed.footer.text);
      if (Array.isArray(embed.fields)) {
        for (const f of embed.fields) {
          if (f.name) parts.push(f.name);
          if (f.value) parts.push(f.value);
        }
      }

      // También añadir otras propiedades string del embed
      for (const key of Object.keys(embed)) {
        if (['title','description','author','footer','fields'].includes(key)) continue;
        const v = embed[key];
        if (typeof v === 'string' && v.trim()) parts.push(v);
      }

      const joined = parts.join(' ').trim();
      if (joined) candidates.push({ source: `embed[${i}]`, text: joined });
    }
  }

  // Nombre del autor como último recurso
  if (msg.author && msg.author.username) {
    candidates.push({ source: 'author.username', text: msg.author.username });
  }

  // webhook id como pista final
  if (msg.webhookID) candidates.push({ source: 'webhookID', text: `webhook:${msg.webhookID}` });

  // Si no hay nada, devuelve vacío
  if (candidates.length === 0) return { bestOverall: null, details: [] };

  // Para cada candidate, analiza contra cada clima y también revisa emojis
  const results = [];

  for (const c of candidates) {
    const text = c.text || '';
    // Detect emoji-based quick match
    const emojiClimate = detectClimateEmoji(text);
    if (emojiClimate) {
      results.push({
        source: c.source,
        text,
        climate: emojiClimate,
        score: 1,
        matchPhrase: `emoji:${emojiClimate}`
      });
      continue;
    }

    // Si no emoji, compara con frases de cada clima y toma mejor
    const climates = Object.keys(CLIMAS_FRASES);
    let bestForCandidate = { climate: null, score: 0, phrase: null };
    for (const k of climates) {
      const res = analyzeAgainstPhrases(text, CLIMAS_FRASES[k]);
      if (res.score > bestForCandidate.score) {
        bestForCandidate = { climate: k, score: res.score, phrase: res.frase };
      }
    }

    results.push({
      source: c.source,
      text,
      climate: bestForCandidate.climate,
      score: bestForCandidate.score,
      matchPhrase: bestForCandidate.phrase
    });
  }

  // Ordena resultados por score descendente y devuelve el mejor
  results.sort((a, b) => (b.score || 0) - (a.score || 0));
  const bestOverall = results[0] || null;

  return { bestOverall, details: results };
}

// =========================
// Logging
// =========================
async function sendLog(client, payload) {
  try {
    const ch = client.channels.cache.get(LOG_CHANNEL) || await client.channels.fetch(LOG_CHANNEL).catch(() => null);
    if (!ch) return;
    const logMsg =
`📩 **Mensaje analizado**
Canal origen: <#${TARGET_CHANNEL}>
Mensaje ID: ${payload.msgId || 'unknown'}
Fuente: ${payload.source || 'unknown'}

Texto analizado:
\`\`\`
${payload.text || '(vacío)'}
\`\`\`

Mejor coincidencia → ${payload.bestClimate || 'ninguna'} (${((payload.bestScore || 0) * 100).toFixed(1)}%)

Detalle por campo:
${payload.detail || '(sin detalle)'}
`;
    await ch.send(logMsg).catch(() => {});
  } catch (err) {
    console.error('Error enviando log de clima:', err);
  }
}

// =========================
// Envío de alerta de carnaval
// =========================
let carnavalActivo = false;
const carnavalProcessed = new Set();

async function sendCarnavalAlert(channel, climaKey, client) {
  if (!channel || !climaKey) return;
  if (carnavalActivo) return;
  carnavalActivo = true;
  try {
    await channel.send({ content: `<@${PING_USER_ID}>`, allowedMentions: { users: [PING_USER_ID] } });
    await channel.send(CLIMAS_EMBED[climaKey]());
  } catch (err) {
    console.error('Error enviando alerta de clima:', err);
  } finally {
    setTimeout(() => { carnavalActivo = false; }, 5000);
  }
}

// =========================
// Manejo de mensajes
// =========================
async function handleMessage(msg) {
  try {
    if (!msg || !msg.channel || msg.channel.id !== TARGET_CHANNEL) return;
    if (carnavalProcessed.has(msg.id)) return;

    // Analiza todos los campos relevantes y obtiene el mejor resultado
    const analysis = analyzeMessageFields(msg);
    const best = analysis.bestOverall;

    // Construir detalle legible
    const detalleLines = (analysis.details || []).map(d => {
      return `${d.source} -> "${d.matchPhrase || '-'}" ${(d.score * 100).toFixed(1)}%`;
    });
    const detalles = detalleLines.join('\n');

    const sourceLabel = msg.webhookID ? `webhook:${msg.webhookID}` : (msg.author ? (msg.author.tag || msg.author.username) : 'unknown');
    const textForLog = (() => {
      // prefer content if present, otherwise join extracted embeds
      if (msg.content && msg.content.trim()) return normalizeText(msg.content);
      const emb = extractTextFromEmbeds(msg.embeds || []);
      if (emb && emb.trim()) return normalizeText(emb);
      if (msg.author && msg.author.username) return msg.author.username;
      if (msg.webhookID) return `webhook:${msg.webhookID}`;
      return '(vacío)';
    })();

    await sendLog(msg.client, {
      msgId: msg.id,
      source: sourceLabel,
      text: textForLog,
      bestClimate: best ? best.climate : null,
      bestScore: best ? best.score : 0,
      detail: detalles || '(sin detalle)'
    });

    if (best && best.score >= UMBRAL) {
      carnavalProcessed.add(msg.id);
      await sendCarnavalAlert(msg.channel, best.climate, msg.client);
    }
  } catch (err) {
    console.error('Error en handleMessage:', err);
  }
}

module.exports = { handleMessage };

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
// Extracción recursiva de strings desde cualquier objeto (útil para embeds con estructura inesperada)
// =========================
function collectStringsDeep(obj, out = []) {
  if (obj == null) return out;
  if (typeof obj === 'string') {
    if (obj.trim()) out.push(obj.trim());
    return out;
  }
  if (typeof obj === 'number' || typeof obj === 'boolean') return out;
  if (Array.isArray(obj)) {
    for (const v of obj) collectStringsDeep(v, out);
    return out;
  }
  if (typeof obj === 'object') {
    for (const k of Object.keys(obj)) {
      try {
        collectStringsDeep(obj[k], out);
      } catch (e) {
        // ignore problematic property
      }
    }
  }
  return out;
}

// =========================
// Extract text from embeds robustamente (usa collectStringsDeep)
 // =========================
function extractTextFromEmbeds(embeds = []) {
  if (!Array.isArray(embeds) || embeds.length === 0) return '';
  const parts = [];
  for (const embed of embeds) {
    if (!embed) continue;
    // propiedades comunes
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
    // Recorre todo recursivamente para atrapar estructuras anidadas (webhooks, forward wrappers, data, etc.)
    const deep = collectStringsDeep(embed);
    for (const s of deep) {
      // evita duplicados ya añadidos (por ejemplo title repeated)
      if (!parts.includes(s)) parts.push(s);
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
// Analiza múltiples campos (content + cada campo de embed + referenced/fetched messages)
// =========================
async function analyzeMessageFields(msg) {
  const candidates = [];

  // 1) content directo
  if (typeof msg.content === 'string' && msg.content.trim().length > 0) {
    candidates.push({ source: 'content', text: msg.content });
  }

  // 2) embeds del propio mensaje (cada embed como candidato)
  if (Array.isArray(msg.embeds)) {
    for (let i = 0; i < msg.embeds.length; i++) {
      const embed = msg.embeds[i];
      if (!embed) continue;
      const extracted = extractTextFromEmbeds([embed]);
      if (extracted && extracted.trim()) candidates.push({ source: `embed[${i}]`, text: extracted });
    }
  }

  // 3) attachments que contengan texto en name o description (defensivo)
  if (msg.attachments && msg.attachments.size > 0) {
    for (const att of msg.attachments.values()) {
      if (att.name) candidates.push({ source: `attachment.name:${att.id}`, text: att.name });
      if (att.description) candidates.push({ source: `attachment.desc:${att.id}`, text: att.description });
    }
  }

  // 4) stickers (algunos clientes insertan texto en stickers' tags)
  if (msg.stickers && msg.stickers.size > 0) {
    for (const st of msg.stickers.values()) {
      if (st.name) candidates.push({ source: `sticker:${st.id}`, text: st.name });
    }
  }

  // 5) Mensaje referenciado / reenviado: si existe referencedMessage, úsolo; si no, intento fetch (puede incluir channelId)
  const referencedCandidates = [];
  try {
    if (msg.referencedMessage) {
      const rm = msg.referencedMessage;
      if (typeof rm.content === 'string' && rm.content.trim()) referencedCandidates.push({ source: 'referenced.content', text: rm.content });
      if (Array.isArray(rm.embeds) && rm.embeds.length) {
        const embText = extractTextFromEmbeds(rm.embeds);
        if (embText && embText.trim()) referencedCandidates.push({ source: 'referenced.embeds', text: embText });
      }
      if (rm.attachments && rm.attachments.size) {
        for (const att of rm.attachments.values()) {
          if (att.name) referencedCandidates.push({ source: `referenced.attachment.name:${att.id}`, text: att.name });
        }
      }
    } else if (msg.reference && msg.reference.messageId) {
      // intenta fetch; si message está en otro canal, usa channelId si viene
      const refChannelId = msg.reference.channelId || msg.channel.id;
      try {
        const refChannel = await msg.client.channels.fetch(refChannelId).catch(() => null);
        if (refChannel && refChannel.isText()) {
          const fetched = await refChannel.messages.fetch(msg.reference.messageId).catch(() => null);
          if (fetched) {
            if (typeof fetched.content === 'string' && fetched.content.trim()) referencedCandidates.push({ source: 'fetchedReferenced.content', text: fetched.content });
            if (Array.isArray(fetched.embeds) && fetched.embeds.length) {
              const embText = extractTextFromEmbeds(fetched.embeds);
              if (embText && embText.trim()) referencedCandidates.push({ source: 'fetchedReferenced.embeds', text: embText });
            }
            if (fetched.attachments && fetched.attachments.size) {
              for (const att of fetched.attachments.values()) {
                if (att.name) referencedCandidates.push({ source: `fetchedReferenced.attachment.name:${att.id}`, text: att.name });
              }
            }
          }
        }
      } catch (e) {
        // no fallar si fetch falla
      }
    }
  } catch (e) {
    // ignore
  }

  // añadir referenciados al conjunto de candidatos (prioridad opcional: push primero para análisis temprano)
  for (const rc of referencedCandidates) candidates.push(rc);

  // 6) author username y webhook id como último recurso
  if (msg.author && msg.author.username) candidates.push({ source: 'author.username', text: msg.author.username });
  if (msg.webhookID) candidates.push({ source: 'webhookID', text: `webhook:${msg.webhookID}` });

  if (candidates.length === 0) return { bestOverall: null, details: [] };

  // analizar cada candidato: emoji quick-match o comparación de frases
  const results = [];
  for (const c of candidates) {
    const text = c.text || '';
    const emojiClimate = detectClimateEmoji(text);
    if (emojiClimate) {
      results.push({ source: c.source, text, climate: emojiClimate, score: 1, matchPhrase: `emoji:${emojiClimate}` });
      continue;
    }

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

    const analysis = await analyzeMessageFields(msg);
    const best = analysis.bestOverall;

    const detalleLines = (analysis.details || []).map(d => {
      return `${d.source} -> "${d.matchPhrase || '-'}" ${(d.score * 100).toFixed(1)}%`;
    });
    const detalles = detalleLines.join('\n');

    const sourceLabel = msg.webhookID ? `webhook:${msg.webhookID}` : (msg.author ? (msg.author.tag || msg.author.username) : 'unknown');

    // Construir texto analizado para el log: preferir content, luego embeds extraídos, luego referenced/fetched
    let textForLog = '(vacío)';
    if (msg.content && msg.content.trim()) textForLog = normalizeText(msg.content);
    else {
      const emb = extractTextFromEmbeds(msg.embeds || []);
      if (emb && emb.trim()) textForLog = normalizeText(emb);
      else if (msg.referencedMessage) {
        const refText = (msg.referencedMessage.content || '') + ' ' + extractTextFromEmbeds(msg.referencedMessage.embeds || []);
        if (refText.trim()) textForLog = normalizeText(refText);
      } else if (msg.reference && msg.reference.messageId) {
        // intento de fetch para mostrar texto en log (no obligatorio)
        try {
          const refChannelId = msg.reference.channelId || msg.channel.id;
          const refChan = await msg.client.channels.fetch(refChannelId).catch(() => null);
          if (refChan && refChan.isText()) {
            const fetched = await refChan.messages.fetch(msg.reference.messageId).catch(() => null);
            if (fetched) {
              const fetchedText = (fetched.content || '') + ' ' + extractTextFromEmbeds(fetched.embeds || []);
              if (fetchedText.trim()) textForLog = normalizeText(fetchedText);
            }
          }
        } catch (e) {
          // ignore
        }
      } else if (msg.author && msg.author.username) textForLog = msg.author.username;
      else if (msg.webhookID) textForLog = `webhook:${msg.webhookID}`;
    }

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

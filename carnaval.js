// carnaval.js
const { MessageEmbed } = require('discord.js');
const stringSimilarity = require('string-similarity');

const TARGET_CHANNEL = '1390187635888095346';
const LOG_CHANNEL = '1424039114537308222';
const PING_USER_ID = '1003512479277662208';

const UMBRAL = 0.19;

// ID a ignorar (no analizar mensajes de este user ni webhooks con este id)
const IGNORED_USER_ID = '1401311520939446342';

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
// Recolector recursivo de strings desde cualquier estructura
// =========================
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
      try {
        collectStringsDeep(obj[k], out, seen);
      } catch (e) {}
    }
  }
  return out;
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
// Detectar emojis de pista de clima
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
// Analizar texto con string-similarity y coincidencia exacta
// =========================
function analyzeAgainstPhrases(text, frases) {
  if (!text || !frases || frases.length === 0) return { frase: null, score: 0 };
  const normalizedText = normalizeText(text);
  let best = { frase: null, score: 0 };
  for (const f of frases) {
    const nf = normalizeText(f);
    if (normalizedText === nf || normalizedText.includes(nf)) return { frase: f, score: 1 };
    const rating = stringSimilarity.compareTwoStrings(normalizedText, nf);
    if (rating > best.score) best = { frase: f, score: rating };
  }
  return best;
}

// =========================
// Analiza múltiples campos y también mensajes referenciados/reenvíos
// Devuelve bestOverall, detalles y candidatos (para logging)
async function analyzeMessageFields(msg) {
  const candidates = [];

  // 0) cleanContent
  if (typeof msg.cleanContent === 'string' && msg.cleanContent.trim()) {
    candidates.push({ source: 'cleanContent', text: msg.cleanContent });
  }

  // 1) content directo
  if (typeof msg.content === 'string' && msg.content.trim()) {
    candidates.push({ source: 'content', text: msg.content });
  }

  // 2) embeds del propio mensaje (cada embed como candidato)
  if (Array.isArray(msg.embeds) && msg.embeds.length) {
    for (let i = 0; i < msg.embeds.length; i++) {
      const extracted = extractTextFromEmbeds([msg.embeds[i]]);
      if (extracted && extracted.trim()) candidates.push({ source: `embed[${i}]`, text: extracted });
    }
  }

  // 3) components (botones, selects)
  if (Array.isArray(msg.components) && msg.components.length) {
    const compsText = collectStringsDeep(msg.components).join(' ');
    if (compsText.trim()) candidates.push({ source: 'components', text: compsText });
  }

  // 4) interaction (cuando proviene de comando / botón)
  if (msg.interaction) {
    const interText = collectStringsDeep(msg.interaction).join(' ');
    if (interText.trim()) candidates.push({ source: 'interaction', text: interText });
  }

  // 5) attachments y stickers
  if (msg.attachments && msg.attachments.size) {
    for (const att of msg.attachments.values()) {
      if (att.name) candidates.push({ source: `attachment.name:${att.id}`, text: att.name });
      if (att.description) candidates.push({ source: `attachment.desc:${att.id}`, text: att.description });
    }
  }
  if (msg.stickers && msg.stickers.size) {
    for (const st of msg.stickers.values()) {
      if (st.name) candidates.push({ source: `sticker:${st.id}`, text: st.name });
    }
  }

  // 6) Mensaje referenciado / reenviado: referencedMessage o fetch
  const referencedCandidates = [];
  try {
    if (msg.referencedMessage) {
      const rm = msg.referencedMessage;
      // Ignorar si autor referenciado es IGNORED_USER_ID
      if (!(rm.author && String(rm.author.id) === IGNORED_USER_ID)) {
        if (rm.content && rm.content.trim()) referencedCandidates.push({ source: 'referenced.content', text: rm.content });
        const embRef = extractTextFromEmbeds(rm.embeds || []);
        if (embRef && embRef.trim()) referencedCandidates.push({ source: 'referenced.embeds', text: embRef });
        const deepRef = collectStringsDeep(rm).join(' ');
        if (deepRef.trim()) referencedCandidates.push({ source: 'referenced.deep', text: deepRef });
      }
    } else if (msg.reference && msg.reference.messageId) {
      const refChannelId = msg.reference.channelId || msg.channel.id;
      try {
        const refChannel = await msg.client.channels.fetch(refChannelId).catch(() => null);
        if (refChannel && (typeof refChannel.isText === 'function' ? refChannel.isText() : (refChannel.type && String(refChannel.type).includes('GUILD')))) {
          const fetched = await refChannel.messages.fetch(msg.reference.messageId).catch(() => null);
          if (fetched) {
            // Ignorar si autor fetched es IGNORED_USER_ID
            if (!(fetched.author && String(fetched.author.id) === IGNORED_USER_ID)) {
              if (fetched.content && fetched.content.trim()) referencedCandidates.push({ source: 'fetchedReferenced.content', text: fetched.content });
              const embText = extractTextFromEmbeds(fetched.embeds || []);
              if (embText && embText.trim()) referencedCandidates.push({ source: 'fetchedReferenced.embeds', text: embText });
              const deepFetched = collectStringsDeep(fetched).join(' ');
              if (deepFetched.trim()) referencedCandidates.push({ source: 'fetchedReferenced.deep', text: deepFetched });
            }
          }
        }
      } catch (e) { /* ignore fetch errors */ }
    }
  } catch (e) { /* ignore referenced errors */ }

  // Añade referenciados antes de continuar para darles prioridad
  for (const rc of referencedCandidates) candidates.push(rc);

  // 7) toJSON deep extraction (cubre campos raros)
  try {
    if (typeof msg.toJSON === 'function') {
      const jsonObj = msg.toJSON();
      const allStrings = collectStringsDeep(jsonObj).join(' ');
      if (allStrings && allStrings.trim()) candidates.push({ source: 'toJSON.deep', text: allStrings });
    }
  } catch (e) {}

  // 8) author, webhook, system labels como último recurso (ignorar si author es IGNORED_USER_ID)
  if (msg.author && String(msg.author.id) !== IGNORED_USER_ID && msg.author.username) candidates.push({ source: 'author.username', text: msg.author.username });
  if (msg.webhookID && String(msg.webhookID) !== IGNORED_USER_ID) candidates.push({ source: 'webhookID', text: `webhook:${msg.webhookID}` });
  if (msg.system) candidates.push({ source: 'system', text: String(msg.system) });

  if (candidates.length === 0) return { bestOverall: null, details: [], candidates: [] };

  // Analizar candidatos: emoji quick-match o similitud por frases
  const results = [];
  for (const c of candidates) {
    const text = c.text || '';
    const emojiClimate = detectClimateEmoji(text);
    if (emojiClimate) {
      results.push({ source: c.source, text, climate: emojiClimate, score: 1, matchPhrase: `emoji:${emojiClimate}` });
      continue;
    }
    let bestForCandidate = { climate: null, score: 0, phrase: null };
    for (const k of Object.keys(CLIMAS_FRASES)) {
      const res = analyzeAgainstPhrases(text, CLIMAS_FRASES[k]);
      if (res.score > bestForCandidate.score) {
        bestForCandidate = { climate: k, score: res.score, phrase: res.frase };
      }
    }
    results.push({ source: c.source, text, climate: bestForCandidate.climate, score: bestForCandidate.score, matchPhrase: bestForCandidate.phrase });
  }

  results.sort((a, b) => (b.score || 0) - (a.score || 0));
  return { bestOverall: results[0] || null, details: results, candidates };
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

    // Ignorar mensajes enviados por IGNORED_USER_ID (author) o por webhooks con ese id
    if ((msg.author && String(msg.author.id) === IGNORED_USER_ID) || (msg.webhookID && String(msg.webhookID) === IGNORED_USER_ID)) return;
    if (carnavalProcessed.has(msg.id)) return;

    const analysis = await analyzeMessageFields(msg);
    const best = analysis.bestOverall;
    const candidates = analysis.candidates || [];

    // Detalle legible
    const detalleLines = (analysis.details || []).map(d => `${d.source} -> "${d.matchPhrase || '-'}" ${(d.score*100).toFixed(1)}%`);
    const detalles = detalleLines.join('\n');

    const sourceLabel = msg.webhookID ? `webhook:${msg.webhookID}` : (msg.author ? (msg.author.tag || msg.author.username) : 'unknown');

    // Preparar texto para log: preferir primer candidato útil
    const firstCandidateText = (candidates[0] && candidates[0].text) ? normalizeText(candidates[0].text) : '(vacío)';
    const debugCandidates = (candidates.length ? candidates.map(c => `${c.source}: ${String(c.text).slice(0,300)}`).join('\n') : '(ninguno)');

    await sendLog(msg.client, {
      msgId: msg.id,
      source: sourceLabel,
      text: firstCandidateText,
      bestClimate: best ? best.climate : null,
      bestScore: best ? best.score : 0,
      detail: (detalles || '(sin detalle)') + '\n\nCandidatos detectados:\n' + debugCandidates
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

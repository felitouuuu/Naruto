// carnaval.js
const { MessageEmbed } = require('discord.js');
const stringSimilarity = require('string-similarity');

const TARGET_CHANNEL = '1390187635888095346';
const LOG_CHANNEL = '1424039114537308222';
const PING_USER_ID = '1003512479277662208';

const UMBRAL = 0.19;
const IGNORED_USER_ID = '1401311520939446342';

// =========================
// Frases solo Luna de Sangre
// =========================
const LUNA_FRASES = [
  '🌕',
  'luna de sangre',
  'la luna carmesí ilumina la noche',
  'todo parece inquieto bajo su influjo oscuro'
];

// =========================
// Embed de alerta Luna
// =========================
function buildLunaEmbed() {
  const oneHourLater = Math.floor(Date.now() / 1000) + 3600;
  return new MessageEmbed()
    .setTitle('🌑 El clima de Luna de Sangre 🩸 está activo.')
    .setDescription('*La luna carmesí ilumina la noche. Todo parece inquieto bajo su influjo oscuro.*')
    .addField('⏱️ Tiempo Restante', `<t:${oneHourLater}:R>`)
    .addField('🚀 Mejora', 'El clima despierta y ha potenciado la actividad **Aventuras**.')
    .setColor('#8B0000')
    .setThumbnail('https://cdn.discordapp.com/attachments/1097327580476080178/1424142544815526029/1_1003512479277662208_nk-dream.png');
}

// =========================
// Utilidades
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

function collectStringsDeep(obj, out = [], seen = new Set(), path = '') {
  if (obj == null) return out;
  if (typeof obj === 'string') {
    const t = obj.trim();
    if (t) out.push({ text: t, path });
    return out;
  }
  if (typeof obj === 'number' || typeof obj === 'boolean') return out;
  if (seen.has(obj)) return out;
  if (typeof obj === 'object') {
    seen.add(obj);
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) collectStringsDeep(obj[i], out, seen, `${path}[${i}]`);
      return out;
    }
    for (const k of Object.keys(obj)) {
      try { collectStringsDeep(obj[k], out, seen, path ? `${path}.${k}` : k); } catch (e) {}
    }
  }
  return out;
}

function extractTextFromEmbeds(embeds = []) {
  const parts = [];
  for (let i = 0; i < (embeds || []).length; i++) {
    const embed = embeds[i];
    if (!embed) continue;
    if (typeof embed.title === 'string') parts.push({ text: embed.title, source: `embed[${i}].title` });
    if (typeof embed.description === 'string') parts.push({ text: embed.description, source: `embed[${i}].description` });
    if (embed.author && typeof embed.author.name === 'string') parts.push({ text: embed.author.name, source: `embed[${i}].author.name` });
    if (embed.footer && typeof embed.footer.text === 'string') parts.push({ text: embed.footer.text, source: `embed[${i}].footer.text` });
    if (Array.isArray(embed.fields)) {
      for (let j = 0; j < embed.fields.length; j++) {
        const f = embed.fields[j];
        if (typeof f.name === 'string') parts.push({ text: f.name, source: `embed[${i}].fields[${j}].name` });
        if (typeof f.value === 'string') parts.push({ text: f.value, source: `embed[${i}].fields[${j}].value` });
      }
    }
    const deep = collectStringsDeep(embed);
    for (const d of deep) {
      if (!parts.find(p => p.text === d.text)) parts.push({ text: d.text, source: `embed[${i}].${d.path}` });
    }
  }
  return parts.map(p => p.text).join(' ');
}

function detectLunaEmoji(text = '') {
  if (!text) return false;
  return text.includes('🌕');
}

function isMostlyNumericOrIds(text = '') {
  if (!text) return true;
  const letters = (text.match(/[a-zA-Záéíóúñü]/g) || []).length;
  const digits = (text.match(/\d/g) || []).length;
  const tokens = text.trim().split(/\s+/).length;
  if (letters === 0 && digits > 0) return true;
  if (digits > letters * 3 && tokens <= 10) return true;
  if ((text.replace(/\s+/g, '')).length < 6 && digits > 0) return true;
  return false;
}

// =========================
// Análisis contra frases de Luna
// =========================
function analyzeAgainstLuna(text) {
  if (!text) return { frase: null, score: 0 };
  const normalizedText = normalizeText(text);

  // coincidencia exacta o inclusión fuerte
  for (const f of LUNA_FRASES) {
    const nf = normalizeText(f);
    if (normalizedText === nf || normalizedText.includes(nf)) return { frase: f, score: 1 };
  }

  // palabra-ratio + string similarity
  let best = { frase: null, score: 0 };
  for (const f of LUNA_FRASES) {
    const nf = normalizeText(f);
    const words = nf.split(/\s+/).filter(Boolean);
    let matches = 0;
    for (const w of words) if (w && normalizedText.includes(w)) matches++;
    const ratio = words.length ? matches / words.length : 0;
    const rating = stringSimilarity.compareTwoStrings(normalizedText, nf);
    const finalScore = Math.max(ratio, rating);
    if (finalScore > best.score) best = { frase: f, score: finalScore };
  }
  return best;
}

// =========================
// Analizar mensaje: recopila candidatos con trust por fuente
// =========================
async function analyzeMessageFields(msg) {
  const candidates = []; // { source, text, trust }

  // system / CHANNEL_FOLLOW_ADD early note
  if (msg.type === 'CHANNEL_FOLLOW_ADD' || msg.system === true) {
    candidates.push({ source: 'system.type', text: String(msg.type || 'SYSTEM'), trust: 0.15 });
  }

  // content/cleanContent high trust
  if (typeof msg.cleanContent === 'string' && msg.cleanContent.trim()) candidates.push({ source: 'cleanContent', text: msg.cleanContent, trust: 1.0 });
  if (typeof msg.content === 'string' && msg.content.trim()) candidates.push({ source: 'content', text: msg.content, trust: 1.0 });

  // embeds high trust
  if (Array.isArray(msg.embeds) && msg.embeds.length) {
    for (let i = 0; i < msg.embeds.length; i++) {
      const extracted = extractTextFromEmbeds([msg.embeds[i]]);
      if (extracted && extracted.trim()) candidates.push({ source: `embed[${i}]`, text: extracted, trust: 1.0 });
    }
  }

  // components / interaction moderate trust
  if (Array.isArray(msg.components) && msg.components.length) {
    const comps = collectStringsDeep(msg.components).map(d => d.text).join(' ');
    if (comps) candidates.push({ source: 'components', text: comps, trust: 0.6 });
  }
  if (msg.interaction) {
    const inter = collectStringsDeep(msg.interaction).map(d => d.text).join(' ');
    if (inter) candidates.push({ source: 'interaction', text: inter, trust: 0.6 });
  }

  // attachments / stickers moderate trust
  if (msg.attachments && typeof msg.attachments.forEach === 'function') {
    for (const att of msg.attachments.values()) {
      if (att.name) candidates.push({ source: `attachment.name:${att.id}`, text: att.name, trust: 0.6 });
      if (att.description) candidates.push({ source: `attachment.desc:${att.id}`, text: att.description, trust: 0.6 });
    }
  }
  if (msg.stickers && typeof msg.stickers.forEach === 'function') {
    for (const st of msg.stickers.values()) {
      if (st.name) candidates.push({ source: `sticker:${st.id}`, text: st.name, trust: 0.6 });
    }
  }

  // referenced message local
  try {
    if (msg.referencedMessage) {
      const rm = msg.referencedMessage;
      if (rm.content && rm.content.trim()) candidates.push({ source: 'referenced.content', text: rm.content, trust: 0.9 });
      const embRef = extractTextFromEmbeds(rm.embeds || []);
      if (embRef && embRef.trim()) candidates.push({ source: 'referenced.embeds', text: embRef, trust: 0.95 });
      const deepRef = collectStringsDeep(rm).map(d => d.text).join(' ');
      if (deepRef) candidates.push({ source: 'referenced.deep', text: deepRef, trust: 0.7 });
    } else if (msg.reference && msg.reference.messageId) {
      // try fetch referenced
      try {
        const refChannelId = msg.reference.channelId || msg.channel.id;
        const refChan = await msg.client.channels.fetch(refChannelId).catch(() => null);
        if (refChan) {
          const fetched = await refChan.messages.fetch(msg.reference.messageId).catch(() => null);
          if (fetched) {
            if (fetched.content && fetched.content.trim()) candidates.push({ source: 'fetchedReferenced.content', text: fetched.content, trust: 0.9 });
            const embFetched = extractTextFromEmbeds(fetched.embeds || []);
            if (embFetched && embFetched.trim()) candidates.push({ source: 'fetchedReferenced.embeds', text: embFetched, trust: 0.95 });
            const deepFetched = collectStringsDeep(fetched).map(d => d.text).join(' ');
            if (deepFetched) candidates.push({ source: 'fetchedReferenced.deep', text: deepFetched, trust: 0.7 });
          }
        }
      } catch (e) {}
    }
  } catch (e) {}

  // toJSON deep as last resort, low trust
  try {
    if (typeof msg.toJSON === 'function') {
      const jsonDeep = collectStringsDeep(msg.toJSON()).map(d => d.text).join(' ');
      if (jsonDeep) candidates.push({ source: 'toJSON.deep', text: jsonDeep, trust: 0.3 });
    }
  } catch (e) {}

  // author/webhook labels low trust but useful for logging
  try {
    if (msg.author && String(msg.author.id) !== IGNORED_USER_ID && msg.author.username) candidates.push({ source: 'author.username', text: msg.author.username, trust: 0.4 });
    if (msg.webhookID && String(msg.webhookID) !== IGNORED_USER_ID) candidates.push({ source: 'webhookID', text: `webhook:${msg.webhookID}`, trust: 0.4 });
  } catch (e) {}

  if (candidates.length === 0) return { bestOverall: null, details: [], candidates: [] };

  // evaluar candidatos: filtrar IDs, emoji quick-match, aplicar trust y penalizaciones por falta de contigüidad
  const results = [];
  for (const c of candidates) {
    const raw = String(c.text || '');
    if (isMostlyNumericOrIds(raw)) {
      // ignorar candidatos que sean mayormente IDs o números
      continue;
    }

    const text = raw;
    // emoji quick-match
    if (detectLunaEmoji(text)) {
      results.push({ source: c.source, text, climate: 'luna', score: 1, matchPhrase: 'emoji:🌕', trust: c.trust || 1.0 });
      continue;
    }

    const res = analyzeAgainstLuna(text);
    const trust = (typeof c.trust === 'number') ? c.trust : 1.0;
    let adjustedScore = res.score * trust;

    // reforzar requisito de contigüidad para frases de >=2 palabras
    if (res.score > 0 && res.frase && res.frase.split(/\s+/).filter(Boolean).length >= 2) {
      const fraseWords = String(res.frase).toLowerCase().split(/\s+/).filter(Boolean);
      let contiguous = false;
      for (let i = 0; i < fraseWords.length - 1; i++) {
        const pair = fraseWords[i] + '\\s+' + fraseWords[i + 1];
        if (new RegExp(pair, 'i').test(text)) { contiguous = true; break; }
      }
      if (!contiguous) {
        adjustedScore = adjustedScore * 0.6; // penalizar si no hay pares contiguos
      } else {
        adjustedScore = Math.max(adjustedScore, 0.85 * trust); // si hay contigüidad, subir confianza mínima relativa
      }
    }

    // ignorar scores extremadamente bajos
    if (adjustedScore <= 0.01) continue;

    results.push({
      source: c.source,
      text,
      climate: res.score > 0 ? 'luna' : null,
      score: adjustedScore,
      matchPhrase: res.frase,
      trust
    });
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

    const detailLines = (payload.details || []).map(d => `${d.source} -> "${d.matchPhrase || '-'}" ${(d.score*100).toFixed(1)}% (trust:${(d.trust||1).toFixed(2)})`).join('\n') || '(sin detalle)';
    const candidatesPreview = (payload.candidates || []).slice(0, 25).map(c => `${c.source}: ${String(c.text).slice(0,300)} (trust:${(c.trust||1).toFixed(2)})`).join('\n') || '(ninguno)';

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
${detailLines}

Candidatos detectados:
${candidatesPreview}
`;
    await ch.send(logMsg).catch(() => {});
  } catch (err) {
    console.error('Error enviando log de clima:', err);
  }
}

// =========================
// Alertas y manejo
let carnavalActivo = false;
const carnavalProcessed = new Set();

async function sendCarnavalAlert(channel, client) {
  if (!channel) return;
  if (carnavalActivo) return;
  carnavalActivo = true;
  try {
    await channel.send({ content: `<@${PING_USER_ID}>`, allowedMentions: { users: [PING_USER_ID] } });
    await channel.send(buildLunaEmbed());
  } catch (err) {
    console.error('Error enviando alerta de clima:', err);
  } finally {
    setTimeout(() => { carnavalActivo = false; }, 5000);
  }
}

async function handleMessage(msg) {
  try {
    if (!msg || !msg.channel || msg.channel.id !== TARGET_CHANNEL) return;
    if ((msg.author && String(msg.author.id) === IGNORED_USER_ID) || (msg.webhookID && String(msg.webhookID) === IGNORED_USER_ID)) return;
    if (carnavalProcessed.has(msg.id)) return;

    const analysis = await analyzeMessageFields(msg);
    const best = analysis.bestOverall;

    const sourceLabel = msg.webhookID ? `webhook:${msg.webhookID}` : (msg.author ? (msg.author.tag || msg.author.username) : 'unknown');

    await sendLog(msg.client, {
      msgId: msg.id,
      source: sourceLabel,
      text: (analysis.candidates && analysis.candidates[0] && analysis.candidates[0].text) ? normalizeText(analysis.candidates[0].text) : '(vacío)',
      bestClimate: best ? best.climate : null,
      bestScore: best ? best.score : 0,
      details: analysis.details,
      candidates: analysis.candidates
    });

    if (best && best.score >= UMBRAL && best.climate === 'luna') {
      carnavalProcessed.add(msg.id);
      await sendCarnavalAlert(msg.channel, msg.client);
    }
  } catch (err) {
    console.error('handleMessage error', err);
  }
}

module.exports = { handleMessage };

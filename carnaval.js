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
  if (typeof obj === 'object' && !seen.has(obj)) {
    seen.add(obj);
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) collectStringsDeep(obj[i], out, seen, `${path}[${i}]`);
    } else {
      for (const k of Object.keys(obj)) collectStringsDeep(obj[k], out, seen, path ? `${path}.${k}` : k);
    }
  }
  return out;
}

function extractTextFromEmbeds(embeds = []) {
  const parts = [];
  for (let i = 0; i < (embeds || []).length; i++) {
    const embed = embeds[i];
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
    for (const d of deep) if (!parts.includes(d.text)) parts.push(d.text);
    // cover embed.data / embed.raw via deep collector above
  }
  return parts.join(' ');
}

function detectLunaEmoji(text = '') {
  if (!text) return false;
  return text.includes('🌕');
}

function analyzeAgainstLuna(text) {
  if (!text) return { frase: null, score: 0 };
  const normalizedText = normalizeText(text);

  // exact or inclusion
  for (const f of LUNA_FRASES) {
    const nf = normalizeText(f);
    if (normalizedText === nf || normalizedText.includes(nf)) return { frase: f, score: 1 };
  }

  // word-match ratio + string-similarity
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
// Recolección y análisis de todos los candidatos posibles
// =========================
async function analyzeMessageFields(msg) {
  const candidates = []; // { source, text }

  // Detect system follow messages early (no contenido original accesible)
  if (msg.type === 'CHANNEL_FOLLOW_ADD' || msg.system === true) {
    candidates.push({ source: 'system.type', text: String(msg.type || 'SYSTEM') });
  }

  if (typeof msg.cleanContent === 'string' && msg.cleanContent.trim()) candidates.push({ source: 'cleanContent', text: msg.cleanContent });
  if (typeof msg.content === 'string' && msg.content.trim()) candidates.push({ source: 'content', text: msg.content });

  if (Array.isArray(msg.embeds) && msg.embeds.length) {
    for (let i = 0; i < msg.embeds.length; i++) {
      const ex = extractTextFromEmbeds([msg.embeds[i]]);
      if (ex && ex.trim()) candidates.push({ source: `embed[${i}]`, text: ex });
    }
  }

  if (Array.isArray(msg.components) && msg.components.length) {
    const comps = collectStringsDeep(msg.components).map(d => d.text).join(' ');
    if (comps) candidates.push({ source: 'components', text: comps });
  }

  if (msg.interaction) {
    const inter = collectStringsDeep(msg.interaction).map(d => d.text).join(' ');
    if (inter) candidates.push({ source: 'interaction', text: inter });
  }

  if (msg.attachments && typeof msg.attachments.forEach === 'function') {
    for (const att of msg.attachments.values()) {
      if (att.name) candidates.push({ source: `attachment.name:${att.id}`, text: att.name });
      if (att.description) candidates.push({ source: `attachment.desc:${att.id}`, text: att.description });
    }
  }

  if (msg.stickers && typeof msg.stickers.forEach === 'function') {
    for (const st of msg.stickers.values()) if (st.name) candidates.push({ source: `sticker:${st.id}`, text: st.name });
  }

  try {
    if (msg.referencedMessage) {
      const rm = msg.referencedMessage;
      if (rm.content && rm.content.trim()) candidates.push({ source: 'referenced.content', text: rm.content });
      const embRef = extractTextFromEmbeds(rm.embeds || []);
      if (embRef && embRef.trim()) candidates.push({ source: 'referenced.embeds', text: embRef });
      const deepRef = collectStringsDeep(rm).map(d => d.text).join(' ');
      if (deepRef) candidates.push({ source: 'referenced.deep', text: deepRef });
    } else if (msg.reference && msg.reference.messageId) {
      try {
        const refChannelId = msg.reference.channelId || msg.channel.id;
        const refChan = await msg.client.channels.fetch(refChannelId).catch(() => null);
        if (refChan) {
          const fetched = await refChan.messages.fetch(msg.reference.messageId).catch(() => null);
          if (fetched) {
            if (fetched.content && fetched.content.trim()) candidates.push({ source: 'fetchedReferenced.content', text: fetched.content });
            const embFetched = extractTextFromEmbeds(fetched.embeds || []);
            if (embFetched && embFetched.trim()) candidates.push({ source: 'fetchedReferenced.embeds', text: embFetched });
            const deepFetched = collectStringsDeep(fetched).map(d => d.text).join(' ');
            if (deepFetched) candidates.push({ source: 'fetchedReferenced.deep', text: deepFetched });
          }
        }
      } catch (e) {}
    }
  } catch (e) {}

  try {
    if (typeof msg.toJSON === 'function') {
      const jsonDeep = collectStringsDeep(msg.toJSON()).map(d => d.text).join(' ');
      if (jsonDeep) candidates.push({ source: 'toJSON.deep', text: jsonDeep });
    }
  } catch (e) {}

  try {
    if (msg.author && String(msg.author.id) !== IGNORED_USER_ID && msg.author.username) candidates.push({ source: 'author.username', text: msg.author.username });
    if (msg.webhookID && String(msg.webhookID) !== IGNORED_USER_ID) candidates.push({ source: 'webhookID', text: `webhook:${msg.webhookID}` });
  } catch (e) {}

  if (candidates.length === 0) return { best: null, details: [], candidates: [] };

  const results = [];
  for (const c of candidates) {
    const text = c.text || '';
    if (detectLunaEmoji(text)) {
      results.push({ source: c.source, text, climate: 'luna', score: 1, matchPhrase: 'emoji:🌕' });
      continue;
    }
    const res = analyzeAgainstLuna(text);
    results.push({ source: c.source, text, climate: res.score > 0 ? 'luna' : null, score: res.score, matchPhrase: res.frase });
  }

  results.sort((a, b) => (b.score || 0) - (a.score || 0));
  return { best: results[0] || null, details: results, candidates };
}

// =========================
// Logging (texto simple en canal de logs)
async function sendLog(client, payload) {
  try {
    const ch = client.channels.cache.get(LOG_CHANNEL) || await client.channels.fetch(LOG_CHANNEL).catch(() => null);
    if (!ch) return;
    const detailLines = (payload.details || []).map(d => `${d.source} -> "${d.matchPhrase || '-'}" ${(d.score*100).toFixed(1)}%`).join('\n') || '(sin detalle)';
    const candPreview = (payload.candidates || []).slice(0, 25).map(c => `${c.source}: ${String(c.text).slice(0,300)}`).join('\n') || '(ninguno)';
    const msg =
`📩 **Mensaje analizado**
Canal origen: <#${TARGET_CHANNEL}>
Mensaje ID: ${payload.msgId || 'unknown'}
Fuente: ${payload.source || 'unknown'}

Texto analizado:
\`\`\`
${payload.text || '(vacío)'}
\`\`\`

Mejor coincidencia → ${payload.bestClimate || 'ninguna'} (${((payload.bestScore||0)*100).toFixed(1)}%)

Detalle por campo:
${detailLines}

Candidatos detectados:
${candPreview}
`;
    await ch.send(msg).catch(()=>{});
  } catch (e) { console.error('sendLog error', e); }
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
  } catch (e) { console.error('sendCarnavalAlert', e); }
  finally { setTimeout(()=>{ carnavalActivo = false; }, 5000); }
}

async function handleMessage(msg) {
  try {
    if (!msg || !msg.channel || msg.channel.id !== TARGET_CHANNEL) return;
    if ((msg.author && String(msg.author.id) === IGNORED_USER_ID) || (msg.webhookID && String(msg.webhookID) === IGNORED_USER_ID)) return;
    if (carnavalProcessed.has(msg.id)) return;

    const analysis = await analyzeMessageFields(msg);
    const best = analysis.best;

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
  } catch (e) {
    console.error('handleMessage error', e);
  }
}

module.exports = { handleMessage };

// carnaval.js
const { MessageEmbed } = require('discord.js');
const stringSimilarity = require('string-similarity');

const TARGET_CHANNEL = '1390187635888095346'; // canal donde llegan los anuncios
const LOG_CHANNEL = '1424039114537308222';    // canal donde se enviarán logs
const PING_USER_ID = '1003512479277662208';   // usuario a mencionar al detectar clima

const UMBRAL = 0.70;

// =========================
// Frases representativas por clima
// =========================
const CLIMAS_FRASES = {
  vientos: [
    '💨 vientos embrujados',
    'vientos embrujados',
    'el aire lleva susurros y carcajadas lejanas',
    'tu mascota se guía por corrientes misteriosas hacia hallazgos prohibidos',
    'corrientes misteriosas',
    'exploración'
  ],
  niebla: [
    '👻 niebla tenebrosa',
    'niebla tenebrosa',
    'una densa bruma cubre el lago',
    'sombras extrañas se mueven bajo la superficie',
    'minería'
  ],
  lluvia: [
    '🌧️ lluvia maldita',
    'lluvia maldita',
    'las gotas golpean el agua como si susurraran conjuros',
    'los peces emergen atraídos por lo desconocido',
    'pesca'
  ],
  luna: [
    '🌕 luna de sangre',
    'luna de sangre',
    'la luna carmesí ilumina la noche',
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
    .replace(/[^a-z0-9áéíóúüñ\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTextFromEmbeds(embeds = []) {
  if (!Array.isArray(embeds) || embeds.length === 0) return '';
  return embeds.map(e => {
    const parts = [];
    if (e.title) parts.push(e.title);
    if (e.description) parts.push(e.description);
    if (e.author && e.author.name) parts.push(e.author.name);
    if (Array.isArray(e.fields)) for (const f of e.fields) parts.push(`${f.name} ${f.value}`);
    if (e.footer && e.footer.text) parts.push(e.footer.text);
    return parts.join(' ');
  }).join(' ');
}

// =========================
// Core
// =========================
let carnavalActivo = false;
const carnavalProcessed = new Set();

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

Mejor coincidencia → ${payload.bestClimate || 'ninguna'} (${(payload.bestScore * 100).toFixed(1)}%)

Detalle por clima:
${payload.detail || '(sin detalle)'}
`;
    await ch.send(logMsg).catch(() => {});
  } catch (err) {
    console.error('Error enviando log de clima:', err);
  }
}

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
// Analizar texto con string-similarity
// =========================
function analyzeAgainstPhrases(text, frases) {
  if (!text || !frases || frases.length === 0) return { frase: null, score: 0 };
  const normalizedText = normalizeText(text);
  const normalizedPhrases = frases.map(f => normalizeText(f));
  const matches = stringSimilarity.findBestMatch(normalizedText, normalizedPhrases);
  const best = matches.bestMatch;
  return { frase: best.target, score: best.rating };
}

// =========================
// Manejo de mensajes
// =========================
async function handleMessage(msg) {
  try {
    if (!msg || !msg.channel || msg.channel.id !== TARGET_CHANNEL) return;
    if (carnavalProcessed.has(msg.id)) return;

    const rawTextParts = [
      msg.content || '',
      extractTextFromEmbeds(msg.embeds || []),
      msg.author ? msg.author.username : '',
      msg.webhookID ? `webhook:${msg.webhookID}` : ''
    ];
    const rawText = rawTextParts.join(' ').trim();
    const text = normalizeText(rawText);

    const resVientos = analyzeAgainstPhrases(text, CLIMAS_FRASES.vientos);
    const resNiebla  = analyzeAgainstPhrases(text, CLIMAS_FRASES.niebla);
    const resLluvia  = analyzeAgainstPhrases(text, CLIMAS_FRASES.lluvia);
    const resLuna    = analyzeAgainstPhrases(text, CLIMAS_FRASES.luna);

    const detalles = [
      `Vientos -> "${resVientos.frase || '-'}" ${(resVientos.score*100).toFixed(1)}%`,
      `Niebla  -> "${resNiebla.frase  || '-'}" ${(resNiebla.score*100).toFixed(1)}%`,
      `Lluvia  -> "${resLluvia.frase  || '-'}" ${(resLluvia.score*100).toFixed(1)}%`,
      `Luna    -> "${resLuna.frase    || '-'}" ${(resLuna.score*100).toFixed(1)}%`
    ].join('\n');

    const all = [
      { key: 'vientos', score: resVientos.score },
      { key: 'niebla', score: resNiebla.score },
      { key: 'lluvia', score: resLluvia.score },
      { key: 'luna', score: resLuna.score }
    ];
    all.sort((a,b) => b.score - a.score);
    const best = all[0];

    await sendLog(msg.client, {
      msgId: msg.id,
      source: msg.webhookID ? `webhook:${msg.webhookID}` : (msg.author ? (msg.author.tag || msg.author.username) : 'unknown'),
      text: text || '(vacío)',
      bestClimate: best.key,
      bestScore: best.score,
      detail: detalles
    });

    if (best.score >= UMBRAL) {
      carnavalProcessed.add(msg.id);
      await sendCarnavalAlert(msg.channel, best.key, msg.client);
    }
  } catch (err) {
    console.error('Error en handleMessage:', err);
  }
}

module.exports = { handleMessage };
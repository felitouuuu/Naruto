// carnaval.js
// Detecta cambios de clima (Vientos, Niebla, Lluvia, Luna) usando similitud con muchas frases.
// Envía logs detallados al canal de logs y hace ping en el canal objetivo cuando se detecta un clima.
//
// Requisitos: discord.js v12.x compatible (ajusta si usas v13+).
const { MessageEmbed } = require('discord.js');

const TARGET_CHANNEL = '1390187635888095346'; // canal donde llegan los anuncios
const LOG_CHANNEL = '1424039114537308222';    // canal donde se enviarán logs
const PING_USER_ID = '1003512479277662208';   // usuario a mencionar al detectar clima

// Umbral de similitud para activar (0..1). Ajustable.
const UMBRAL = 0.70;

// =========================
// Frases representativas por clima (muchas variantes para mayor precisión)
// =========================
const CLIMAS_FRASES = {
  vientos: [
    // título / frase principal
    'el clima ha cambiado a vientos embrujados',
    'el clima ha cambiado a 💨 vientos embrujados',
    'vientos embrujados',
    // descripción
    'el aire lleva susurros y carcajadas lejanas',
    'tu mascota se guía por corrientes misteriosas hacia hallazgos prohibidos',
    'corrientes misteriosas',
    'susurros y carcajadas',
    // mejora / actividad
    'exploración',
    // otras variantes cortas
    'vientos embrujados'
  ],

  niebla: [
    'el clima ha cambiado a niebla tenebrosa',
    'el clima ha cambiado a 👻 niebla tenebrosa',
    'niebla tenebrosa',
    'una densa bruma cubre el lago',
    'bruma cubre el lago',
    'sombras extrañas se mueven bajo la superficie',
    'sombras extrañas',
    // mejora / actividad
    'minería',
    // variantes
    'bruma densa',
    'niebla oscura'
  ],

  lluvia: [
    'el clima ha cambiado a lluvia maldita',
    'el clima ha cambiado a 🌧️ lluvia maldita',
    'lluvia maldita',
    'las gotas golpean el agua como si susurraran conjuros',
    'las gotas golpean el agua',
    'susurraran conjuros',
    'los peces emergen atraidos por lo desconocido',
    'peces emergen atraidos por lo desconocido',
    // mejora / actividad
    'pesca',
    // variantes
    'lluvia oscura',
    'lluvia conjuros'
  ],

  luna: [
    'el clima ha cambiado a luna de sangre',
    'el clima ha cambiado a 🌕 luna de sangre',
    'luna de sangre',
    'la luna carmesí ilumina la noche',
    'todo parece inquieto bajo su influjo oscuro',
    'la luna carmesi ilumina la noche',
    // variantes
    'luna carmesí',
    'influjo oscuro'
  ]
};

// =========================
// Embeds builders (mensajes que el bot enviará al detectar)
// =========================
const CLIMAS_EMBED = {
  vientos: () => {
    const oneHourLater = Math.floor(Date.now() / 1000) + 3600;
    return new MessageEmbed()
      .setTitle('💨 El clima ha cambiado a Vientos Embrujados')
      .setDescription('*El aire lleva susurros y carcajadas lejanas. Tu mascota se guía por corrientes misteriosas hacia hallazgos prohibidos.*')
      .addField('⏱️ Tiempo Restante', `<t:${oneHourLater}:R>`, true)
      .addField('🚀 Mejora', 'Potencia la actividad **Exploración**.', false)
      .setColor('#6A5ACD')
      .setTimestamp();
  },
  niebla: () => {
    const oneHourLater = Math.floor(Date.now() / 1000) + 3600;
    return new MessageEmbed()
      .setTitle('👻 El clima ha cambiado a Niebla Tenebrosa')
      .setDescription('*Una densa bruma cubre el lago. Sombras extrañas se mueven bajo la superficie.*')
      .addField('⏱️ Tiempo Restante', `<t:${oneHourLater}:R>`, true)
      .addField('🚀 Mejora', 'Potencia la actividad **Minería**.', false)
      .setColor('#708090')
      .setTimestamp();
  },
  lluvia: () => {
    const oneHourLater = Math.floor(Date.now() / 1000) + 3600;
    return new MessageEmbed()
      .setTitle('🌧️ El clima ha cambiado a Lluvia Maldita')
      .setDescription('*Las gotas golpean el agua como si susurraran conjuros. Los peces emergen, atraídos por lo desconocido.*')
      .addField('⏱️ Tiempo Restante', `<t:${oneHourLater}:R>`, true)
      .addField('🚀 Mejora', 'Potencia la actividad **Pesca**.', false)
      .setColor('#483D8B')
      .setTimestamp();
  },
  luna: () => {
    const oneHourLater = Math.floor(Date.now() / 1000) + 3600;
    return new MessageEmbed()
      .setTitle('🌕 El clima ha cambiado a Luna de Sangre')
      .setDescription('*La luna carmesí ilumina la noche. Todo parece inquieto bajo su influjo oscuro.*')
      .addField('⏱️ Tiempo Restante', `<t:${oneHourLater}:R>`, true)
      .addField('🚀 Mejora', 'Potencia la actividad **Aventuras**.', false)
      .setColor('#8B0000')
      .setTimestamp();
  }
};

// =========================
// Util: Levenshtein + similitud
// =========================
function levenshtein(a, b) {
  a = a || '';
  b = b || '';
  const al = a.length, bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;

  const v0 = new Array(bl + 1);
  const v1 = new Array(bl + 1);

  for (let j = 0; j <= bl; j++) v0[j] = j;

  for (let i = 0; i < al; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < bl; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= bl; j++) v0[j] = v1[j];
  }
  return v1[bl];
}

function similarity(a, b) {
  if (!a || !b) return 0;
  a = a.toLowerCase();
  b = b.toLowerCase();
  const distance = levenshtein(a, b);
  return 1 - distance / Math.max(a.length, b.length);
}

// =========================
// Helpers: extraer texto de embeds, normalizar
// =========================
function extractTextFromEmbeds(embeds = []) {
  if (!Array.isArray(embeds) || embeds.length === 0) return '';
  return embeds.map(e => {
    const parts = [];
    if (e.title) parts.push(e.title);
    if (e.description) parts.push(e.description);
    if (e.author && e.author.name) parts.push(e.author.name);
    if (Array.isArray(e.fields) && e.fields.length) {
      for (const f of e.fields) parts.push(`${f.name} ${f.value}`);
    }
    if (e.footer && e.footer.text) parts.push(e.footer.text);
    return parts.join(' ');
  }).join(' ');
}

function normalizeText(s = '') {
  return (s || '')
    .toLowerCase()
    .replace(/[`*_>~|••—–—…]/g, ' ') // markdown/decoration chars
    .replace(/<a?:\w+:\d+>/g, ' ')   // emoji mentions
    .replace(/http[^\s]+/g, ' ')     // urls
    .replace(/[^a-z0-9áéíóúüñ\s]/gi, ' ') // keep letters, numbers, accents and spaces
    .replace(/\s+/g, ' ')
    .trim();
}

// =========================
// Core
// =========================
let carnavalActivo = false;
const carnavalProcessed = new Set(); // evita re-procesar el mismo mensaje

async function sendLog(client, payload) {
  try {
    const ch = client.channels.cache.get(LOG_CHANNEL) || await client.channels.fetch(LOG_CHANNEL).catch(() => null);
    if (!ch) return;
    // Enviar como embed para mejor lectura
    const embed = new MessageEmbed()
      .setTitle('📩 Log — Mensaje analizado')
      .addField('Canal origen', `<#${TARGET_CHANNEL}>`, true)
      .addField('Mensaje ID', payload.msgId || 'unknown', true)
      .addField('Fuente', payload.source || 'unknown', false)
      .addField('Texto analizado', payload.text ? `\`\`\`\n${payload.text.slice(0, 1000)}\n\`\`\`` : '(vacío)')
      .addField('Mejor coincidencia', `${payload.bestClimate || 'ninguna'} (${(payload.bestScore * 100).toFixed(1)}%)`, true)
      .addField('Detalle por clima', payload.detail || '(sin detalle)', false)
      .setTimestamp();
    await ch.send(embed).catch(() => {});
  } catch (err) {
    // no hacemos console.log masivo; solo error puntual
    console.error('Error enviando log de clima:', err);
  }
}

async function sendCarnavalAlert(channel, climaKey, client) {
  if (!channel || !climaKey) return;
  if (carnavalActivo) return;
  carnavalActivo = true;
  try {
    await channel.send({
      content: `<@${PING_USER_ID}>`,
      allowedMentions: { users: [PING_USER_ID] }
    }).catch(() => {});
    const embed = CLIMAS_EMBED[climaKey]();
    await channel.send(embed).catch(() => {});
  } catch (err) {
    console.error('Error enviando alerta de clima:', err);
  } finally {
    setTimeout(() => { carnavalActivo = false; }, 5000);
  }
}

// Analiza texto contra array de frases y devuelve la mejor coincidencia
function analyzeAgainstPhrases(text, frases) {
  let best = { frase: null, score: 0 };
  for (const f of frases) {
    const s = similarity(text, normalizeText(f));
    if (s > best.score) best = { frase: f, score: s };
  }
  return best;
}

// Función principal que exportas: manejar mensajes entrantes
async function handleMessage(msg) {
  try {
    if (!msg || !msg.channel || msg.channel.id !== TARGET_CHANNEL) return;
    if (carnavalProcessed.has(msg.id)) return;

    // extraer todo el texto posible (content + embeds + author username + fields)
    const rawTextParts = [
      msg.content || '',
      extractTextFromEmbeds(msg.embeds || []),
      msg.author ? (msg.author.username || '') : '',
      msg.webhookID ? `webhook:${msg.webhookID}` : ''
    ];
    const rawText = rawTextParts.join(' ').trim();
    const text = normalizeText(rawText);

    // analizar por clima (cada uno por separado)
    const resVientos = analyzeAgainstPhrases(text, CLIMAS_FRASES.vientos);
    const resNiebla  = analyzeAgainstPhrases(text, CLIMAS_FRASES.niebla);
    const resLluvia  = analyzeAgainstPhrases(text, CLIMAS_FRASES.lluvia);
    const resLuna    = analyzeAgainstPhrases(text, CLIMAS_FRASES.luna);

    const detalles = [
      `Vientos -> "${resVientos.frase || '-'}" ${ (resVientos.score*100).toFixed(1) }%`,
      `Niebla  -> "${resNiebla.frase  || '-'}" ${ (resNiebla.score*100).toFixed(1) }%`,
      `Lluvia  -> "${resLluvia.frase  || '-'}" ${ (resLluvia.score*100).toFixed(1) }%`,
      `Luna    -> "${resLuna.frase    || '-'}" ${ (resLuna.score*100).toFixed(1) }%`
    ].join('\n');

    // elegir mejor clima
    const all = [
      { key: 'vientos', score: resVientos.score },
      { key: 'niebla', score: resNiebla.score },
      { key: 'lluvia', score: resLluvia.score },
      { key: 'luna', score: resLuna.score }
    ];
    all.sort((a,b) => b.score - a.score);
    const best = all[0];

    // mandar log con detalle
    await sendLog(msg.client, {
      msgId: msg.id,
      source: msg.webhookID ? `webhook:${msg.webhookID}` : (msg.author ? `${msg.author.tag || msg.author.username}` : 'unknown'),
      text: text || '(vacío)',
      bestClimate: best.key,
      bestScore: best.score,
      detail: detalles
    });

    // si supera umbral -> enviar alerta y marcar procesado
    if (best.score >= UMBRAL) {
      carnavalProcessed.add(msg.id);
      await sendCarnavalAlert(msg.channel, best.key, msg.client);
    }
  } catch (err) {
    console.error('Error en handleMessage:', err);
  }
}

module.exports = {
  handleMessage
};
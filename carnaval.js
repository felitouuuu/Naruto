// carnaval.js
const { MessageEmbed } = require('discord.js');

const TARGET_CHANNEL = '1390187635888095346'; // canal climas
const LOG_CHANNEL = '1424039114537308222';    // canal logs
const PING_USER_ID = '1003512479277662208';

// -------------------------
// Frases por clima
// -------------------------
const LUNA_FRASES = [
  'el clima ha cambiado a luna de sangre',
  'la luna carmesí ilumina la noche todo parece inquieto bajo su influjo oscuro'
];

const VIENTOS_FRASES = [
  'el clima ha cambiado a vientos embrujados',
  'el aire lleva susurros y carcajadas lejanas tu mascota se guía por corrientes misteriosas hacia hallazgos prohibidos'
];

const NIEBLA_FRASES = [
  'el clima ha cambiado a niebla tenebrosa',
  'una densa bruma cubre el lago sombras extrañas se mueven bajo la superficie'
];

const LLUVIA_FRASES = [
  'el clima ha cambiado a lluvia maldita',
  'las gotas golpean el agua como si susurraran conjuros los peces emergen atraidos por lo desconocido'
];

// -------------------------
// Embeds builders
// -------------------------
const CLIMAS = {
  luna: {
    buildEmbed: () => {
      const oneHourLater = Math.floor(Date.now() / 1000) + 3600;
      return new MessageEmbed()
        .setTitle('🌕 El clima ha cambiado a Luna de Sangre')
        .setDescription('*La luna carmesí ilumina la noche. Todo parece inquieto bajo su influjo oscuro.*')
        .addField('⏱️ Tiempo Restante', `<t:${oneHourLater}:R>`)
        .addField('🚀 Mejora', 'Potencia la actividad **Aventuras**.')
        .setColor('#8B0000')
        .setTimestamp();
    }
  },
  vientos: {
    buildEmbed: () => {
      const oneHourLater = Math.floor(Date.now() / 1000) + 3600;
      return new MessageEmbed()
        .setTitle('💨 El clima ha cambiado a Vientos Embrujados')
        .setDescription('*El aire lleva susurros y carcajadas lejanas.*')
        .addField('⏱️ Tiempo Restante', `<t:${oneHourLater}:R>`)
        .addField('🚀 Mejora', 'Potencia la actividad **Exploración**.')
        .setColor('#6A5ACD')
        .setTimestamp();
    }
  },
  niebla: {
    buildEmbed: () => {
      const oneHourLater = Math.floor(Date.now() / 1000) + 3600;
      return new MessageEmbed()
        .setTitle('👻 El clima ha cambiado a Niebla Tenebrosa')
        .setDescription('*Una densa bruma cubre el lago.*')
        .addField('⏱️ Tiempo Restante', `<t:${oneHourLater}:R>`)
        .addField('🚀 Mejora', 'Potencia la actividad **Minería**.')
        .setColor('#708090')
        .setTimestamp();
    }
  },
  lluvia: {
    buildEmbed: () => {
      const oneHourLater = Math.floor(Date.now() / 1000) + 3600;
      return new MessageEmbed()
        .setTitle('🌧️ El clima ha cambiado a Lluvia Maldita')
        .setDescription('*Las gotas golpean el agua como si susurraran conjuros.*')
        .addField('⏱️ Tiempo Restante', `<t:${oneHourLater}:R>`)
        .addField('🚀 Mejora', 'Potencia la actividad **Pesca**.')
        .setColor('#483D8B')
        .setTimestamp();
    }
  }
};

// =====================
// Funciones de similitud
// =====================
function levenshtein(a, b) {
  const matrix = Array.from({ length: a.length + 1 }, () => []);
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[a.length][b.length];
}

function similarity(a, b) {
  if (!a || !b) return 0;
  a = a.toLowerCase();
  b = b.toLowerCase();
  const distance = levenshtein(a, b);
  return 1 - distance / Math.max(a.length, b.length);
}

// =====================
// Core
// =====================
let carnavalActivo = false;
const carnavalProcessed = new Set();

function extractTextFromEmbeds(embeds = []) {
  return embeds.map(e => {
    return [e.title, e.description, ...(e.fields?.map(f => `${f.name} ${f.value}`) || [])]
      .filter(Boolean).join(' ');
  }).join(' ');
}

function normalizeText(s = '') {
  return s.toLowerCase().replace(/[^a-záéíóúüñ\s]/gi, '').replace(/\s+/g, ' ').trim();
}

async function sendCarnavalToChannel(channel, climaKey) {
  if (!channel || !climaKey) return;
  if (carnavalActivo) return;

  carnavalActivo = true;
  try {
    await channel.send({
      content: `<@${PING_USER_ID}>`,
      allowedMentions: { users: [PING_USER_ID] }
    });
    await channel.send(CLIMAS[climaKey].buildEmbed());
  } finally {
    setTimeout(() => { carnavalActivo = false; }, 5000);
  }
}

function analyzeAgainstPhrases(text, frases) {
  let best = { frase: null, score: 0 };
  for (const frase of frases) {
    const score = similarity(text, normalizeText(frase));
    if (score > best.score) best = { frase, score };
  }
  return best;
}

async function handleMessage(msg) {
  if (!msg || !msg.channel || msg.channel.id !== TARGET_CHANNEL) return;
  if (carnavalProcessed.has(msg.id)) return;

  const text = normalizeText([
    msg.content || '',
    extractTextFromEmbeds(msg.embeds || []),
    msg.author?.username || ''
  ].join(' '));

  // Analizar por separado cada clima
  const resultados = {
    luna: analyzeAgainstPhrases(text, LUNA_FRASES),
    vientos: analyzeAgainstPhrases(text, VIENTOS_FRASES),
    niebla: analyzeAgainstPhrases(text, NIEBLA_FRASES),
    lluvia: analyzeAgainstPhrases(text, LLUVIA_FRASES)
  };

  // Elegir el clima con mayor score
  let mejorClima = null;
  let mejorScore = 0;
  for (const k of Object.keys(resultados)) {
    if (resultados[k].score > mejorScore) {
      mejorScore = resultados[k].score;
      mejorClima = k;
    }
  }

  // Mandar log al canal de logs
  const logChannel = msg.client.channels.cache.get(LOG_CHANNEL) 
    || await msg.client.channels.fetch(LOG_CHANNEL).catch(() => null);

  if (logChannel) {
    await logChannel.send(
      `📩 **Mensaje detectado**\n` +
      `Texto: \`${text || "(vacío)"}\`\n` +
      `Mejor coincidencia → ${mejorClima || "ninguna"} (${(mejorScore * 100).toFixed(1)}%)`
    );
  }

  // Si supera el umbral, activar clima
  const UMBRAL = 0.75;
  if (mejorClima && mejorScore >= UMBRAL) {
    carnavalProcessed.add(msg.id);
    await sendCarnavalToChannel(msg.channel, mejorClima);
  }
}

module.exports = { handleMessage };
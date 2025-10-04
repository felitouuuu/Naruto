// carnaval.js
const { MessageEmbed } = require('discord.js');

const TARGET_CHANNEL = '1390187635888095346';
const PING_USER_ID = '1003512479277662208';

// 🎭 Climas configurados
const CLIMAS = {
  luna: {
    keywords: [
      'luna de sangre',
      '🌕 luna de sangre',
      'la luna carmesí ilumina la noche',
      'todo parece inquieto bajo su influjo oscuro'
    ],
    buildEmbed: () => {
      const oneHourLater = Math.floor(Date.now() / 1000) + 60 * 60;
      return new MessageEmbed()
        .setTitle('🌑 El clima ha cambiado a Luna de Sangre 🩸')
        .setDescription('*La luna carmesí ilumina la noche. Todo parece inquieto bajo su influjo oscuro.*')
        .addField('⏱️ Tiempo Restante', `<t:${oneHourLater}:R>`, true)
        .addField('🚀 Mejora', 'Favorece la actividad **aventuras**.\nMayor probabilidad de obtener ítems raros.', false)
        .setColor('#8B0000')
        .setTimestamp();
    }
  },
  vientos: {
    keywords: [
      'vientos embrujados',
      'el clima ha cambiado a vientos embrujados',
      'el aire lleva susurros y carcajadas lejanas'
    ],
    buildEmbed: () => {
      const oneHourLater = Math.floor(Date.now() / 1000) + 60 * 60;
      return new MessageEmbed()
        .setTitle('🌬️ El clima ha cambiado a Vientos Embrujados')
        .setDescription('*El aire lleva susurros y carcajadas lejanas.*')
        .addField('⏱️ Tiempo Restante', `<t:${oneHourLater}:R>`, true)
        .addField('👻 Mejora', 'Favorece la actividad **exploraciones**.\nEncuentros más misteriosos.', false)
        .setColor('#6A5ACD')
        .setTimestamp();
    }
  },
  niebla: {
    keywords: [
      'niebla tenebrosa',
      'el clima ha cambiado a niebla tenebrosa',
      'una densa bruma cubre el lago'
    ],
    buildEmbed: () => {
      const oneHourLater = Math.floor(Date.now() / 1000) + 60 * 60;
      return new MessageEmbed()
        .setTitle('🌫️ El clima ha cambiado a Niebla Tenebrosa')
        .setDescription('*Una densa bruma cubre el lago.*')
        .addField('⏱️ Tiempo Restante', `<t:${oneHourLater}:R>`, true)
        .addField('🕯️ Mejora', 'Favorece la actividad **investigaciones**.\nMayor hallazgo de secretos.', false)
        .setColor('#708090')
        .setTimestamp();
    }
  },
  lluvia: {
    keywords: [
      'lluvia maldita',
      'el clima ha cambiado a lluvia maldita',
      'las gotas golpean el agua como si susurraran conjuros'
    ],
    buildEmbed: () => {
      const oneHourLater = Math.floor(Date.now() / 1000) + 60 * 60;
      return new MessageEmbed()
        .setTitle('🌧️ El clima ha cambiado a Lluvia Maldita')
        .setDescription('*Las gotas golpean el agua como si susurraran conjuros.*')
        .addField('⏱️ Tiempo Restante', `<t:${oneHourLater}:R>`, true)
        .addField('💧 Mejora', 'Favorece la actividad **pesca**.\nMayor probabilidad de capturas raras.', false)
        .setColor('#483D8B')
        .setTimestamp();
    }
  }
};

let carnavalActivo = false;
const carnavalProcessed = new Set();

async function sendCarnavalToChannel(channel, clima) {
  if (!channel || !clima) return;
  if (carnavalActivo) return;

  carnavalActivo = true;
  try {
    await channel.send({
      content: `<@${PING_USER_ID}>`,
      allowedMentions: { users: [PING_USER_ID] }
    });
    await channel.send(CLIMAS[clima].buildEmbed()).catch(() => {});
  } catch (e) {
    console.error('Error enviando embed de carnaval:', e);
  }
  setTimeout(() => { carnavalActivo = false; }, 5000);
}

async function handleMessage(msg) {
  if (!msg) return;
  const isBot = msg.author && msg.author.bot;

  if (msg.channel && msg.channel.id === TARGET_CHANNEL) {
    let climaDetectado = null;

    // Mensajes normales
    if (msg.content) {
      for (const clima in CLIMAS) {
        if (CLIMAS[clima].keywords.some(k => msg.content.toLowerCase().includes(k.toLowerCase()))) {
          climaDetectado = clima;
          break;
        }
      }
    }

    // Embeds de canal seguido
    if (!climaDetectado && msg.embeds && msg.embeds.length > 0 && !carnavalProcessed.has(msg.id)) {
      for (const clima in CLIMAS) {
        const found = msg.embeds.some(e => {
          const title = (e.title || '').toLowerCase();
          const desc = (e.description || '').toLowerCase();
          const fields = (e.fields || []).map(f => (f.name + ' ' + f.value).toLowerCase()).join(' ');
          return CLIMAS[clima].keywords.some(k => title.includes(k) || desc.includes(k) || fields.includes(k));
        });
        if (found) {
          carnavalProcessed.add(msg.id);
          climaDetectado = clima;
          break;
        }
      }
    }

    if (climaDetectado) {
      await sendCarnavalToChannel(msg.channel, climaDetectado);
    }
  }
}

module.exports = {
  handleMessage,
  sendCarnavalToChannel
};
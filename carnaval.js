// carnaval.js
const { MessageEmbed } = require('discord.js');

const TARGET_CHANNEL = '1390187635888095346'; // canal donde se anuncian los climas
const PING_USER_ID = '1003512479277662208';  // usuario a mencionar

// 🎭 Climas configurados
const CLIMAS = {
  luna: {
    keywords: [
      'luna de sangre',
      '🌕 luna de sangre',
      'el clima ha cambiado a 🌕 luna de sangre',
      'la luna carmesí ilumina la noche'
    ],
    buildEmbed: () => {
      const oneHourLater = Math.floor(Date.now() / 1000) + 60 * 60;
      return new MessageEmbed()
        .setTitle('🌕 El clima ha cambiado a Luna de Sangre')
        .setDescription('*La luna carmesí ilumina la noche. Todo parece inquieto bajo su influjo oscuro.*')
        .addField('⏱️ Tiempo Restante', `<t:${oneHourLater}:R>`, true)
        .addField('🚀 Mejora', 'El clima está en favor de la actividad **Aventuras**.\nLa probabilidad de obtener ítems raros es mayor.', false)
        .setColor('#8B0000')
        .setTimestamp();
    }
  },
  vientos: {
    keywords: [
      'vientos embrujados',
      'el clima ha cambiado a 🌬️ vientos embrujados',
      'el aire lleva susurros y carcajadas lejanas'
    ],
    buildEmbed: () => {
      const oneHourLater = Math.floor(Date.now() / 1000) + 60 * 60;
      return new MessageEmbed()
        .setTitle('💨 El clima ha cambiado a Vientos Embrujados')
        .setDescription('*El aire lleva susurros y carcajadas lejanas.*')
        .addField('⏱️ Tiempo Restante', `<t:${oneHourLater}:R>`, true)
        .addField('🚀 Mejora', 'El clima está en favor de la actividad **Exploración**.\nLa probabilidad de obtener ítems raros es mayor.', false)
        .setColor('#6A5ACD')
        .setTimestamp();
    }
  },
  niebla: {
    keywords: [
      'niebla tenebrosa',
      'el clima ha cambiado a 👻 niebla tenebrosa',
      'una densa bruma cubre el lago'
    ],
    buildEmbed: () => {
      const oneHourLater = Math.floor(Date.now() / 1000) + 60 * 60;
      return new MessageEmbed()
        .setTitle('👻 El clima ha cambiado a Niebla Tenebrosa')
        .setDescription('*Una densa bruma cubre el lago.*')
        .addField('⏱️ Tiempo Restante', `<t:${oneHourLater}:R>`, true)
        .addField('🚀 Mejora', 'El clima está en favor de la actividad **Minería**.\nLa probabilidad de obtener ítems raros es mayor.', false)
        .setColor('#708090')
        .setTimestamp();
    }
  },
  lluvia: {
    keywords: [
      'lluvia maldita',
      'el clima ha cambiado a 🌧️ lluvia maldita',
      'las gotas golpean el agua como si susurraran conjuros'
    ],
    buildEmbed: () => {
      const oneHourLater = Math.floor(Date.now() / 1000) + 60 * 60;
      return new MessageEmbed()
        .setTitle('🌧️ El clima ha cambiado a Lluvia Maldita')
        .setDescription('*Las gotas golpean el agua como si susurraran conjuros.*')
        .addField('⏱️ Tiempo Restante', `<t:${oneHourLater}:R>`, true)
        .addField('🚀 Mejora', 'El clima está en favor de la actividad **Pesca**.\nLa probabilidad de obtener ítems raros es mayor.', false)
        .setColor('#483D8B')
        .setTimestamp();
    }
  }
};

let carnavalActivo = false;
const carnavalProcessed = new Set();

// 🔔 Enviar embed de clima con ping
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

// 👀 Detección de climas
async function handleMessage(msg) {
  if (!msg) return;

  if (msg.channel && msg.channel.id === TARGET_CHANNEL) {
    let climaDetectado = null;

    // 1) Mensajes de texto
    if (msg.content) {
      for (const clima in CLIMAS) {
        if (CLIMAS[clima].keywords.some(k => msg.content.toLowerCase().includes(k.toLowerCase()))) {
          climaDetectado = clima;
          break;
        }
      }
    }

    // 2) Mensajes embebidos (caso de canales seguidos)
    if (!climaDetectado && msg.embeds && msg.embeds.length > 0 && !carnavalProcessed.has(msg.id)) {
      for (const clima in CLIMAS) {
        const found = msg.embeds.some(e => {
          const title = (e.title || '').toLowerCase();
          const desc = (e.description || '').toLowerCase();
          const fields = (e.fields || []).map(f => (f.name + ' ' + f.value).toLowerCase()).join(' ');
          return CLIMAS[clima].keywords.some(k =>
            title.includes(k) || desc.includes(k) || fields.includes(k)
          );
        });
        if (found) {
          carnavalProcessed.add(msg.id);
          climaDetectado = clima;
          break;
        }
      }
    }

    // 3) Si detecta clima, manda embed con ping
    if (climaDetectado) {
      await sendCarnavalToChannel(msg.channel, climaDetectado);
    }
  }
}

module.exports = {
  handleMessage,
  sendCarnavalToChannel
};
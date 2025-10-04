// carnaval.js
const { MessageEmbed } = require('discord.js');

const TARGET_CHANNEL = '1390187635888095346'; 
const PING_USER_ID = '1003512479277662208';  

const TRIGGER_KEYWORDS = [
  'luna de sangre',
  '🌕 luna de sangre',
  'la luna carmesí ilumina la noche',
  'todo parece inquieto bajo su influjo oscuro'
];
const TRIGGER_COMMAND = '!carnaval';

// Configuración de climas
const WEATHER_CONFIG = {
  '🌧️ Lluvia Maldita': {
    color: '#1E90FF',
    description: 'La lluvia maldita cae sin descanso, alterando la tranquilidad del lugar.',
    mejora: 'El clima favorece actividades **aventuras acuáticas** y aumenta la probabilidad de encontrar objetos mojados.'
  },
  '💨 Vientos Embrujados': {
    color: '#87CEEB',
    description: 'Los vientos embrujados arrasan con todo, haciendo que todo tiemble.',
    mejora: 'El clima favorece actividades **exploración** y aumenta la probabilidad de encontrar objetos voladores.'
  },
  '👻 Niebla Tenebrosa': {
    color: '#708090',
    description: 'La niebla cubre todo con un aura fantasmagórica.',
    mejora: 'El clima favorece actividades **sigilo** y aumenta la probabilidad de encuentros misteriosos.'
  },
  '🌑 Luna de Sangre': {
    color: '#8B0000',
    description: 'La luna carmesí ilumina la noche. Todo parece inquieto bajo su influjo oscuro.',
    mejora: 'El clima está en favor de la actividad **aventuras**.\nLa probabilidad de obtener items raros es mayor.'
  }
};

let carnavalActivo = false;
const carnavalProcessed = new Set();
let lastWeather = '';

// Genera embed según el clima
function buildWeatherEmbed(weatherName) {
  const config = WEATHER_CONFIG[weatherName];
  if (!config) return null;

  const oneHourLater = Math.floor(Date.now() / 1000) + 60 * 60;

  return new MessageEmbed()
    .setTitle(`🌟 El clima de ${weatherName} está activo`)
    .setDescription(`*${config.description}*`)
    .addField('⏱️ Tiempo Restante', `<t:${oneHourLater}:R>`, true)
    .addField('🚀 Mejora', config.mejora, false)
    .addField('🎪 Carnaval', 'Usa `!pet adventure` para aprovechar el clima.', false)
    .setColor(config.color)
    .setFooter('Evento temporal — disfruta mientras dure')
    .setTimestamp()
    .setThumbnail('https://cdn.discordapp.com/attachments/1097327580476080178/1423691592061026546/3_1003512479277662208_nk-dream.png?ex=68e13b9e&is=68dfea1e&hm=d67175ca7e161fd4408697afc41e446337a4ad0cc6169a2c4842411cac73db8b');
}

async function sendWeatherEmbed(channel, weatherName) {
  if (!channel || !weatherName) return;
  if (carnavalActivo) return;

  carnavalActivo = true;
  try {
    await channel.send(`<@${PING_USER_ID}>`).catch(() => {});
    const embed = buildWeatherEmbed(weatherName);
    if (embed) await channel.send(embed).catch(() => {});
  } catch (e) {
    console.error('Error enviando embed de clima:', e);
  }
  setTimeout(() => { carnavalActivo = false; }, 5000);
}

async function handleWeatherChange(msg) {
  if (!msg) return;

  const text = (msg.content || '').toLowerCase();
  const embedTexts = (msg.embeds || []).map(e => 
    ((e.title || '') + ' ' + (e.description || '') + ' ' + (e.fields || []).map(f => f.name + ' ' + f.value).join(' '))
    .toLowerCase()
  ).join(' ');

  for (const weatherName of Object.keys(WEATHER_CONFIG)) {
    const weatherLower = weatherName.toLowerCase();
    if ((text.includes(weatherLower) || embedTexts.includes(weatherLower)) && lastWeather !== weatherName) {
      lastWeather = weatherName;
      const target = msg.client.channels.cache.get(TARGET_CHANNEL) 
                     || await msg.client.channels.fetch(TARGET_CHANNEL).catch(() => null);
      if (!target) return;

      await sendWeatherEmbed(target, weatherName);
      break;
    }
  }
}

async function handleMessage(msg) {
  if (!msg) return;
  const isBot = msg.author && msg.author.bot;

  // Comando manual (!carnaval)
  if (msg.content && msg.content.trim().toLowerCase() === TRIGGER_COMMAND.toLowerCase() && !isBot) {
    const target = msg.client.channels.cache.get(TARGET_CHANNEL)
                   || await msg.client.channels.fetch(TARGET_CHANNEL).catch(() => null);
    if (!target) {
      await msg.reply('No pude encontrar el canal de carnaval configurado.').catch(() => {});
    } else {
      await sendWeatherEmbed(target, '🌑 Luna de Sangre');
      try { await msg.react('✅'); } catch (e) {}
    }
  }

  // Watcher de mensajes en TARGET_CHANNEL
  if (msg.channel && msg.channel.id === TARGET_CHANNEL) {
    // Palabras clave de carnaval
    if (msg.content && TRIGGER_KEYWORDS.some(k => msg.content.toLowerCase().includes(k.toLowerCase()))) {
      await sendWeatherEmbed(msg.channel, '🌑 Luna de Sangre');
      return;
    }

    // Analizar embeds de palabras clave
    if (!carnavalProcessed.has(msg.id) && msg.embeds && msg.embeds.length > 0) {
      const found = msg.embeds.some(e => {
        const title = (e.title || '').toLowerCase();
        const desc = (e.description || '').toLowerCase();
        const fields = (e.fields || []).map(f => (f.name + ' ' + f.value).toLowerCase()).join(' ');
        return TRIGGER_KEYWORDS.some(k => title.includes(k) || desc.includes(k) || fields.includes(k));
      });
      if (found) {
        carnavalProcessed.add(msg.id);
        await sendWeatherEmbed(msg.channel, '🌑 Luna de Sangre');
      }
    }

    // Detectar otros climas
    await handleWeatherChange(msg);
  }
}

module.exports = {
  handleMessage,
  sendWeatherEmbed,
  buildWeatherEmbed
};
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

let carnavalActivo = false;
const carnavalProcessed = new Set();

// Genera embed de Luna de Sangre
function buildCarnavalEmbed() {
  const oneHourLater = Math.floor(Date.now() / 1000) + 60 * 60;

  return new MessageEmbed()
    .setTitle('🌑 El clima de Luna de Sangre 🩸 está activo')
    .setDescription('*La luna carmesí ilumina la noche. Todo parece inquieto bajo su influjo oscuro.*')
    .addField('⏱️ Tiempo Restante', `<t:${oneHourLater}:R>`, true)
    .addField('🚀 Mejora', 'El clima está en favor de la actividad **aventuras**.\nLa probabilidad de obtener items raros es mayor.', false)
    .addField('🎪 Carnaval', 'Usa `!pet adventure` para aprovechar el carnaval.', false)
    .setColor('#8B0000')
    .setFooter('Evento temporal — disfruta mientras dure')
    .setTimestamp()
    .setThumbnail('https://cdn.discordapp.com/attachments/1097327580476080178/1423691592061026546/3_1003512479277662208_nk-dream.png?ex=68e13b9e&is=68dfea1e&hm=d67175ca7e161fd4408697afc41e446337a4ad0cc6169a2c4842411cac73db8b');
}

async function sendCarnavalToChannel(channel) {
  if (!channel) return;
  if (carnavalActivo) return;

  carnavalActivo = true;
  try {
    await channel.send(`<@${PING_USER_ID}>`).catch(() => {});
    await channel.send(buildCarnavalEmbed()).catch(() => {});
  } catch (e) {
    console.error('Error enviando embed de carnaval:', e);
  }
  setTimeout(() => { carnavalActivo = false; }, 5000);
}

async function handleMessage(msg) {
  if (!msg) return;
  const isBot = msg.author && msg.author.bot;

  // ---- Comando manual ----
  if (msg.content && msg.content.trim().toLowerCase() === TRIGGER_COMMAND.toLowerCase() && !isBot) {
    const target = msg.client.channels.cache.get(TARGET_CHANNEL)
                   || await msg.client.channels.fetch(TARGET_CHANNEL).catch(() => null);
    if (!target) {
      await msg.reply('No pude encontrar el canal de carnaval configurado.').catch(() => {});
    } else {
      await sendCarnavalToChannel(target);
      try { await msg.react('✅'); } catch (e) {}
    }
  }

  // ---- Watcher en canal configurado ----
  if (msg.channel && msg.channel.id === TARGET_CHANNEL) {
    let detected = false;

    // 1) Mensajes normales
    if (msg.content && TRIGGER_KEYWORDS.some(k => msg.content.toLowerCase().includes(k.toLowerCase()))) {
      detected = true;
    }

    // 2) Mensajes de canal seguido (normalmente embed)
    if (!detected && msg.embeds && msg.embeds.length > 0 && !carnavalProcessed.has(msg.id)) {
      const found = msg.embeds.some(e => {
        const title = (e.title || '').toLowerCase();
        const desc = (e.description || '').toLowerCase();
        const fields = (e.fields || []).map(f => (f.name + ' ' + f.value).toLowerCase()).join(' ');
        return TRIGGER_KEYWORDS.some(k => title.includes(k) || desc.includes(k) || fields.includes(k));
      });
      if (found) {
        carnavalProcessed.add(msg.id);
        detected = true;
      }
    }

    if (detected) {
      await sendCarnavalToChannel(msg.channel);
    }
  }
}

module.exports = {
  handleMessage,
  sendCarnavalToChannel,
  buildCarnavalEmbed
};
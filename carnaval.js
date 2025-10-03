// carnaval.js
const { MessageEmbed } = require('discord.js');

const TARGET_CHANNEL = '1390187635888095346'; // canal donde se espera el embed
const PING_USER_ID = '1003512479277662208';   // id a mencionar (@felitou)
const TRIGGER_KEYWORDS = ['luna de sangre', 'sangre', 'luna'];
const TRIGGER_COMMAND = '!carnaval';

let carnavalActivo = false;
let carnavalTimer = null;
const carnavalProcessed = new Set(); // para no repetir embeds

function buildCarnavalEmbed() {
  const oneHourLater = Math.floor(Date.now() / 1000) + 60 * 60; // 1 hora desde ahora

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
  if (carnavalActivo) return; // evita repeticiones

  carnavalActivo = true;
  try {
    await channel.send(`<@${PING_USER_ID}>`).catch(() => {});
    await channel.send(buildCarnavalEmbed()).catch(() => {});
  } catch (e) {}

  // recordatorio 1 hora después
  carnavalTimer = setTimeout(async () => {
    try {
      const remindEmbed = new MessageEmbed()
        .setTitle('⏲️ Recordatorio: Luna de Sangre (1h)')
        .setDescription('Ha pasado 1 hora desde que se activó la Luna de Sangre. Revisa el carnaval y aprovecha los últimos minutos.')
        .addField('Comando recomendado', '`!pet adventure`', true)
        .setColor('#550000')
        .setTimestamp();
      await channel.send(`<@${PING_USER_ID}>`).catch(() => {});
      await channel.send(remindEmbed).catch(() => {});
    } catch (e) {}
    carnavalActivo = false;
    carnavalTimer = null;
  }, 60 * 60 * 1000);
}

async function handleMessage(msg) {
  if (!msg) return;

  // ----- Comando manual (!carnaval) -----
  try {
    if (msg.content && msg.content.trim().toLowerCase() === TRIGGER_COMMAND && !(msg.author && msg.author.bot)) {
      const target = msg.client.channels.cache.get(TARGET_CHANNEL) || await msg.client.channels.fetch(TARGET_CHANNEL).catch(() => null);
      if (!target) {
        await msg.reply('No pude encontrar el canal de carnaval configurado.').catch(() => {});
      } else {
        await sendCarnavalToChannel(target);
        try { await msg.react('✅'); } catch (e) {}
      }
    }
  } catch (e) {}

  // ----- Watcher de embeds en TARGET_CHANNEL -----
  try {
    if (msg.channel && msg.channel.id === TARGET_CHANNEL) {
      if (!carnavalProcessed.has(msg.id) && msg.embeds && msg.embeds.length > 0) {
        const found = msg.embeds.some(e => {
          const title = (e.title || '').toLowerCase();
          const desc = (e.description || '').toLowerCase();
          const fields = (e.fields || []).map(f => (f.name + ' ' + f.value).toLowerCase()).join(' ');
          return TRIGGER_KEYWORDS.some(k => title.includes(k) || desc.includes(k) || fields.includes(k));
        });
        if (found) {
          carnavalProcessed.add(msg.id);
          await sendCarnavalToChannel(msg.channel);
        }
      }
    }
  } catch (e) {}
}

// Exportar funciones para usar en index.js
module.exports = {
  handleMessage,
  sendCarnavalToChannel,
  buildCarnavalEmbed
};
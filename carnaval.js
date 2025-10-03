// carnaval.js
// Escucha embeds en un canal específico y, si detecta "Luna de Sangre",
// hace ping + embed decorado y recordatorio.
// Además, incluye el comando de prueba !carnaval.
// Uso: require('./carnaval.js')(client);

const { MessageEmbed } = require('discord.js');

const TARGET_CHANNEL = '1390187635888095346';   // Canal donde escucha
const PING_USER_ID = '1003512479277662208';     // Usuario a mencionar
const TRIGGER_KEYWORDS = ['luna de sangre', 'sangre', 'luna'];
const TRIGGER_COMMAND = '!carnaval';

module.exports = (client) => {
  const processed = new Set();        // mensajes ya procesados
  const activeReminders = new Set();  // evitar reminders duplicados

  function buildEventEmbed() {
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
      .setThumbnail('https://i.imgur.com/3V6H3bM.png');
  }

  async function sendEventToChannel(channel) {
    if (!channel) return null;

    await channel.send(`<@${PING_USER_ID}>`).catch(() => {});
    const eventEmbed = buildEventEmbed();
    const sent = await channel.send(eventEmbed).catch(() => null);
    if (!sent) return null;

    if (!activeReminders.has(sent.id)) {
      activeReminders.add(sent.id);
      setTimeout(async () => {
        try {
          const remindEmbed = new MessageEmbed()
            .setTitle('⏲️ Recordatorio: Luna de Sangre (1h)')
            .setDescription('Ha pasado 1 hora desde que se activó la Luna de Sangre. Revisa el carnaval y aprovecha los últimos minutos.')
            .addField('Comando recomendado', '`!pet adventure`', true)
            .setColor('#550000')
            .setTimestamp();

          await channel.send(`<@${PING_USER_ID}>`).catch(() => {});
          await channel.send(remindEmbed).catch(() => {});
        } catch (e) {
          // nada
        } finally {
          activeReminders.delete(sent.id);
        }
      }, 60 * 60 * 1000); // 1 hora
    }

    return sent;
  }

  client.on('message', async (msg) => {
    try {
      if (!msg) return;

      // 1) Comando manual !carnaval
      if (msg.content && msg.content.trim().toLowerCase() === TRIGGER_COMMAND && !(msg.author && msg.author.bot)) {
        const target = client.channels.cache.get(TARGET_CHANNEL) || await client.channels.fetch(TARGET_CHANNEL).catch(() => null);
        if (!target) {
          await msg.reply('No pude encontrar el canal de carnaval configurado.').catch(() => {});
          return;
        }

        await sendEventToChannel(target);
        try { await msg.react('✅'); } catch (e) {}
        return;
      }

      // 2) Watcher de embeds en canal objetivo
      if (!msg.channel || msg.channel.id !== TARGET_CHANNEL) return;
      if (processed.has(msg.id)) return;
      if (msg.author && msg.author.id === client.user.id) return;
      if (!msg.embeds || msg.embeds.length === 0) return;

      const found = msg.embeds.some(e => {
        const title = (e.title || '').toLowerCase();
        const desc = (e.description || '').toLowerCase();
        const fields = (e.fields || []).map(f => (f.name + ' ' + f.value).toLowerCase()).join(' ');
        return TRIGGER_KEYWORDS.some(k => title.includes(k) || desc.includes(k) || fields.includes(k));
      });

      if (!found) return;
      processed.add(msg.id);

      await sendEventToChannel(msg.channel);

    } catch (err) {
      // silencioso
    }
  });
};
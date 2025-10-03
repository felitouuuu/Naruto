// carnaval/carnaval.js
// Escucha embeds en un canal específico y, si detecta "Luna de Sangre",
// hace ping + embed decorado y recordatorio.
// Además, incluye el comando de prueba !carnaval.
// Uso: require('./carnaval/carnaval.js')(client);

const { MessageEmbed } = require('discord.js');

const TARGET_CHANNEL = '1390187635888095346';
const PING_USER_ID = '1003512479277662208'; // @felitou
const TRIGGER_KEYWORDS = ['luna de sangre', 'sangre', 'luna'];
const TRIGGER_COMMAND = '!carnaval';

module.exports = (client) => {
  const processed = new Set();        // mensajes ya procesados por watcher
  const activeReminders = new Set();  // evitar reminders duplicados por mensaje

  // helper: crea el embed del evento
  function buildEventEmbed() {
    return new MessageEmbed()
      .setTitle('🌑 El clima de Luna de Sangre :drop_of_blood: está activo')
      .setDescription('*La luna carmesí ilumina la noche. Todo parece inquieto bajo su influjo oscuro.*')
      .addField('⏱️ Tiempo', '1 hora (recordatorio programado)', true)
      .addField('🚀 Mejora', 'El clima está en favor de la actividad **aventuras**.\nLa probabilidad de obtener items raros es mayor.', false)
      .addField('🎪 Carnaval', 'Ven a aprovechar el comando `!pet adventure` para obtener grandiosas cosas en el carnaval.', false)
      .setColor('#8B0000')
      .setFooter('Evento temporal — disfruta mientras dure')
      .setTimestamp()
      .setThumbnail('https://i.imgur.com/3V6H3bM.png');
  }

  // helper: envía el evento al canal y programa remind (si no hay uno activo para ese mensaje)
  async function sendEventToChannel(channel) {
    if (!channel) return null;
    // mencionar al usuario primero (para que llegue la notificación)
    await channel.send(`<@${PING_USER_ID}>`).catch(() => {});
    const eventEmbed = buildEventEmbed();
    const sent = await channel.send(eventEmbed).catch(() => null);
    if (!sent) return null;

    // programar reminder si no existe para este mensaje
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
          // noop
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

      // -------------------------
      // 1) Comando de prueba !carnaval
      // -------------------------
      if (msg.content && msg.content.trim().toLowerCase() === TRIGGER_COMMAND && !(msg.author && msg.author.bot)) {
        // enviar al canal TARGET_CHANNEL para que la prueba sea igual al evento real
        const target = client.channels.cache.get(TARGET_CHANNEL) || await client.channels.fetch(TARGET_CHANNEL).catch(() => null);
        if (!target) {
          // si no encuentra el canal, responde donde se ejecutó el comando
          await msg.reply('No pude encontrar el canal de carnaval configurado.').catch(() => {});
          return;
        }

        await sendEventToChannel(target);
        try { await msg.react('✅'); } catch (e) {}
        return;
      }

      // -------------------------
      // 2) Watcher de embeds (solo en TARGET_CHANNEL)
      // -------------------------
      if (!msg.channel || msg.channel.id !== TARGET_CHANNEL) return;
      if (processed.has(msg.id)) return;
      if (msg.author && msg.author.id === client.user.id) return; // ignorar mensajes del propio bot
      if (!msg.embeds || msg.embeds.length === 0) return;

      const found = msg.embeds.some(e => {
        const title = (e.title || '').toLowerCase();
        const desc = (e.description || '').toLowerCase();
        const fields = (e.fields || []).map(f => (f.name + ' ' + f.value).toLowerCase()).join(' ');
        return TRIGGER_KEYWORDS.some(k => title.includes(k) || desc.includes(k) || fields.includes(k));
      });

      if (!found) return;
      processed.add(msg.id);

      // enviar el embed de evento al mismo canal (mención + embed) y programar reminder
      await sendEventToChannel(msg.channel);

    } catch (err) {
      // silencioso para no romper el bot
    }
  });
};
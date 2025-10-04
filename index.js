// index.js (final solicitado)
// Requiere: discord.js v12.x
const { Client, MessageEmbed } = require('discord.js');
const client = new Client({
  ws: { intents: ['GUILDS', 'GUILD_MESSAGES'] }
});

const CANAL_ID = '1401680611810476082'; // canal de avisos
const ROL_ID = '1390189325244829737';   // rol a pingear en avisos

// ======================================================
// 📌 Inicializar módulo Carnaval (módulo intacto)
const carnaval = require('./carnaval.js'); // importa carnaval.js
// ======================================================

// ======================================================
// 📌 Función: enviar anuncio de encendido (usada en ready y !testr)
async function sendStartupAnnouncement() {
  try {
    const ch = client.canal || (client.channels.cache.get(CANAL_ID) || await client.channels.fetch(CANAL_ID).catch(() => null));
    if (!ch) return;
    const msg = `<@&${ROL_ID}> ✅ El bot se ha encendido y está activo.`;
    await ch.send(msg).catch(() => {});
  } catch (err) {
    console.error('Error enviando anuncio de inicio:', err);
  }
}

// ======================================================
// 📌 Evento Ready
// ======================================================
client.on('ready', async () => {
  console.log(`✅ Bot activo como ${client.user.tag}`);
  client.canal = client.channels.cache.get(CANAL_ID) || await client.channels.fetch(CANAL_ID).catch(() => null);
  // enviar anuncio de encendido (sin créditos)
  await sendStartupAnnouncement();
});

// ======================================================
// 📌 Evento Message
// ======================================================
client.on('message', async (msg) => {
  // primero carnaval (se mantiene)
  await carnaval.handleMessage(msg);

  // luego comandos normales
  if (msg.author.bot) return;

  // !ping
  if (msg.content === '!ping') {
    const sent = await msg.channel.send('Calculando información...').catch(() => null);
    const latencyMessage = sent ? (sent.createdTimestamp - msg.createdTimestamp) : 'N/A';
    const latencyAPI = Math.round(client.ws.ping);

    const embed = new MessageEmbed()
      .setTitle('🎃🏓 Info del bot (Halloween)')
      .setColor('#8B0000') // estilo Halloween oscuro
      .setDescription('Datos del bot — ¡mira bajo la luz de la luna!')
      .addField('API (latencia)', `${latencyAPI} ms`, true)
      .addField('Mi Ping', `${latencyMessage} ms`, true)
      .addField('Nota', 'Este servidor está protegido por sombras. Usa los comandos con cuidado.', false)
      .setThumbnail(msg.author.displayAvatarURL({ dynamic: true, size: 64 }))
      .setFooter('🦇 Comando: !ping')
      .setTimestamp();

    if (sent) sent.edit('', embed).catch(() => msg.channel.send(embed));
    else msg.channel.send(embed);

    return;
  }

  // !testr -> enviar el mismo mensaje que en ready (anuncio de encendido)
  if (msg.content === '!testr') {
    // enviar al canal de avisos exactamente el mismo texto que en ready
    await sendStartupAnnouncement();
    // confirmar al usuario que se envió el test (mantener comportamiento simple)
    msg.reply('Test reinicio enviado.').catch(() => msg.channel.send('Test reinicio enviado.'));
    return;
  }

  // !help
  if (msg.content === '!help') {
    const helpEmbed = new MessageEmbed()
      .setTitle('📖 Comandos disponibles — Edición Tenebrosa')
      .setColor('#6A0DAD')
      .setDescription('Lista de comandos disponibles — ¡échale un vistazo bajo la luz de la luna! 🎃')
      .addField('!ping', 'Muestra latencia del bot.', false)
      .addField('!testr', 'Envía un test de reinicio (anuncio de encendido).', false)
      .addField('!help', 'Muestra este mensaje de ayuda.', false)
      .setFooter('Usa los comandos con el prefijo "!". 🦇')
      .setThumbnail(msg.author.displayAvatarURL({ dynamic: true, size: 64 }))
      .setTimestamp();

    msg.channel.send(helpEmbed);
    return;
  }
});

// ======================================================
// 📌 Login
// ======================================================
client.login(process.env.TOKEN);
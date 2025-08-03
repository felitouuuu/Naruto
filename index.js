const { Client, MessageEmbed } = require('discord.js');
const client = new Client();

const startTime = Date.now();
const LIMIT_HOURS = 500;
const LIMIT_MS = LIMIT_HOURS * 60 * 60 * 1000;

client.on('ready', () => {
  console.log(`✅ Bot activo como ${client.user.tag}`);
});

client.on('message', async (msg) => {
  if (msg.author.bot) return;
  if (msg.content === '!ping') {
    const sent = await msg.channel.send('Calculando ping...');

    const latencyMessage = sent.createdTimestamp - msg.createdTimestamp;
    const latencyAPI = Math.round(client.ws.ping);

    const now = Date.now();
    const timeLeftMs = Math.max(0, LIMIT_MS - (now - startTime));
    const hours = Math.floor(timeLeftMs / (1000 * 60 * 60));
    const minutes = Math.floor((timeLeftMs % (1000 * 60 * 60)) / (1000 * 60));

    const embed = new MessageEmbed()
      .setTitle('🏓 Pong!')
      .setColor('#0099ff')
      .addField('Tu ping aproximado', `${latencyMessage} ms`, true)
      .addField('Latencia API', `${latencyAPI} ms`, true)
      .addField('Tiempo restante (Railway Free)', `${hours}h ${minutes}min aprox`, false)
      .setThumbnail(msg.author.displayAvatarURL({ dynamic: true, size: 64 }))
      .setFooter('Tu bot se reiniciará cuando se agoten las horas del mes.')
      .setTimestamp();

    sent.edit('', embed);
  }
});

client.login(process.env.TOKEN);

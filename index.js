const { Client, MessageEmbed } = require('discord.js');
const client = new Client();

const startTime = Date.now(); // Hora en que el bot inició
const LIMIT_HOURS = 500;
const LIMIT_MS = LIMIT_HOURS * 60 * 60 * 1000; // 500 horas en ms

client.on('ready', () => {
  console.log(`✅ Bot activo como ${client.user.tag}`);
});

client.on('message', (msg) => {
  if (msg.content === '!ping') {
    const ping = client.ws.ping;
    const now = Date.now();
    const timeLeftMs = Math.max(0, LIMIT_MS - (now - startTime));

    const hours = Math.floor(timeLeftMs / (1000 * 60 * 60));
    const minutes = Math.floor((timeLeftMs % (1000 * 60 * 60)) / (1000 * 60));

    const embed = new MessageEmbed()
      .setTitle('🏓 Ping')
      .setColor('#0099ff')
      .addField('Latencia API', `${ping}ms`)
      .addField('Tiempo restante (Railway Free)', `${hours}h ${minutes}min aprox`)
      .setFooter('Tu bot se reinicia cuando se agotan las horas del mes.');

    msg.channel.send(embed);
  }
});

client.login(process.env.TOKEN);

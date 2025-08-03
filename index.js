const { Client, MessageEmbed } = require('discord.js');
const client = new Client();

// Tiempo en que se encendió el bot
const startTime = Date.now();

client.on('ready', () => {
  console.log(`✅ Bot activo como ${client.user.tag}`);
});

client.on('message', async (msg) => {
  if (msg.content === '!ping') {
    const botPing = Math.round(client.ws.ping); // Ping del bot en ms

    // Tiempo restante aproximado si estás usando 16h/día (Railway free plan)
    const tiempoEncendido = Date.now() - startTime;
    const milisRestantes = 16 * 60 * 60 * 1000 - tiempoEncendido;
    const minutosRestantes = Math.max(Math.floor(milisRestantes / 60000), 0);

    const embed = new MessageEmbed()
      .setTitle('🏓 Pong!')
      .setColor('#00FF99')
      .addField('📶 Latencia del bot', `${botPing} ms`, true)
      .addField('⏳ Tiempo restante aproximado antes de apagarse', `${minutosRestantes} minutos`, true)
      .setTimestamp();

    msg.channel.send(embed);
  }
});

client.login(process.env.TOKEN);

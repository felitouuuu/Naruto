const { Client } = require('discord.js');
const client = new Client();

client.on('ready', () => {
  console.log(`✅ Bot activo como ${client.user.tag}`);
});

client.on('message', (msg) => {
  if (msg.content === '!ping') {
    msg.channel.send('🏓 Pong!');
  }
});

client.login(process.env.TOKEN);

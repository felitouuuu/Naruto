const { Client, MessageEmbed } = require('discord.js');
const fetch = require('node-fetch'); // Para obtener banner via API

const client = new Client();

const LIMIT_HOURS = 500;
const LIMIT_MS = LIMIT_HOURS * 60 * 60 * 1000;

let startTime = Date.now();

async function getBotBannerURL(userId, token) {
  // Llamada API Discord para obtener el banner
  try {
    const res = await fetch(`https://discord.com/api/v10/users/${userId}`, {
      headers: { Authorization: `Bot ${token}` }
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.banner) return null;

    const ext = data.banner.startsWith('a_') ? 'gif' : 'png';
    return `https://cdn.discordapp.com/banners/${userId}/${data.banner}.${ext}?size=512`;
  } catch {
    return null;
  }
}

client.on('ready', async () => {
  console.log(`✅ Bot activo como ${client.user.tag}`);

  // Guardamos tiempo de inicio
  startTime = Date.now();

  // Obtenemos banner del bot para usar después
  client.botBannerURL = await getBotBannerURL(client.user.id, process.env.TOKEN);
});

client.on('message', async (msg) => {
  if (msg.author.bot) return;
  if (msg.content === '!ping') {
    const sent = await msg.channel.send('Calculando ping...');

    const latencyMessage = sent.createdTimestamp - msg.createdTimestamp;
    const latencyAPI = Math.round(client.ws.ping);

    const now = Date.now();
    const timeLeftMs = Math.max(0, LIMIT_MS - (now - startTime));
    const timeLeftSeconds = Math.floor(timeLeftMs / 1000);
    const timestampDiscord = Math.floor(Date.now() / 1000) + Math.floor(timeLeftMs / 1000);

    // Embed con banner si existe
    const embed = new MessageEmbed()
      .setTitle('🏓 Pong!')
      .setColor('#0099ff')
      .addField('Tu ping aproximado', `${latencyMessage} ms`, true)
      .addField('Latencia API', `${latencyAPI} ms`, true)
      .addField('Tiempo restante (Railway Free)', `<t:${timestampDiscord}:R>`, false)
      .setThumbnail(msg.author.displayAvatarURL({ dynamic: true, size: 64 }))
      .setFooter('Tu bot se reiniciará cuando se agoten las horas del mes.')
      .setTimestamp();

    if (client.botBannerURL) {
      embed.setImage(client.botBannerURL);
    }

    sent.edit('', embed);
  }
});

client.login(process.env.TOKEN);

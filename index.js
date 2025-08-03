const { Client, MessageEmbed } = require('discord.js');
const fetch = require('node-fetch'); // Para obtener banner via API

const client = new Client();

const LIMIT_HOURS = 500;
const LIMIT_MS = LIMIT_HOURS * 60 * 60 * 1000;

let startTime = Date.now();
let aviso5Enviado = false;  // Aviso 5 minutos

async function getBotBannerURL(userId, token) {
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

  startTime = Date.now();

  client.botBannerURL = await getBotBannerURL(client.user.id, process.env.TOKEN);

  // ID del canal donde quieres que mande el aviso
  const canalID = '1401680611810476082'; // Reemplaza con tu canal
  const canal = client.channels.cache.get(canalID);

  const aviso5Ms = 5 * 60 * 1000;

  setInterval(() => {
    const tiempoTranscurrido = Date.now() - startTime;
    const tiempoRestante = LIMIT_MS - tiempoTranscurrido;

    if (tiempoRestante <= aviso5Ms && !aviso5Enviado) {
      aviso5Enviado = true;
      if (canal) {
        canal.send(`<@&1401680611810476082> ⚠️ ⚠️ ¡Quedan 5 minutos para que el bot se apague!`);
      } else {
        console.log('No se encontró el canal para enviar el aviso de 5 minutos.');
      }
    }
  }, 60 * 1000);
});

client.on('message', async (msg) => {
  if (msg.author.bot) return;
  if (msg.content === '!ping') {
    const sent = await msg.channel.send('Calculando ping...');

    const latencyMessage = sent.createdTimestamp - msg.createdTimestamp;
    const latencyAPI = Math.round(client.ws.ping);

    const now = Date.now();
    const timeLeftMs = Math.max(0, LIMIT_MS - (now - startTime));
    const timestampDiscord = Math.floor(Date.now() / 1000) + Math.floor(timeLeftMs / 1000);

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

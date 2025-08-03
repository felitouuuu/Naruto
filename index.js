const { Client, MessageEmbed } = require('discord.js');
const fetch = require('node-fetch');

const client = new Client();

const LIMIT_HOURS = 500;
const LIMIT_MS = LIMIT_HOURS * 60 * 60 * 1000;

let startTime = Date.now();
let avisoEnviado = false;

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
  avisoEnviado = false;

  client.botBannerURL = await getBotBannerURL(client.user.id, process.env.TOKEN);

  const canalID = '1401680611810476082';
  client.canal = client.channels.cache.get(canalID);

  if (client.canal) {
    client.canal.send('<@&1390189325244829737> ✅ El bot se ha encendido y el plan de 500 horas se ha reiniciado. ¡Estamos activos de nuevo!');
  } else {
    console.log('No se encontró el canal para enviar el aviso de reinicio.');
  }

  setInterval(() => {
    if (avisoEnviado) return;

    const tiempoTranscurrido = Date.now() - startTime;
    const tiempoRestante = LIMIT_MS - tiempoTranscurrido;
    const aviso2hMs = 2 * 60 * 60 * 1000; // 2 horas

    if (tiempoRestante <= aviso2hMs) {
      avisoEnviado = true;
      if (client.canal) {
        client.canal.send('<@&1390189325244829737> ⚠️ ¡Quedan 2 horas para que el bot se apague!');
      } else {
        console.log('No se encontró el canal para enviar el aviso.');
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

  else if (msg.content === '!testa') {
    if (client.canal) {
      client.canal.send('<@&1390189325244829737> ⚠️ ¡Este es un test! Faltan 2 horas para que el bot se apague.');
      msg.reply('Test de recordatorio enviado.');
    } else {
      msg.reply('No se encontró el canal para enviar el test.');
    }
  }

  else if (msg.content === '!testr') {
    if (client.canal) {
      client.canal.send('<@&1390189325244829737> ✅ ¡Test de reinicio! El bot está activo y el plan de 500 horas se ha reiniciado.');
      msg.reply('Test de reinicio enviado.');
    } else {
      msg.reply('No se encontró el canal para enviar el test de reinicio.');
    }
  }

  else if (msg.content === '!help') {
    const helpEmbed = new MessageEmbed()
      .setTitle('📖 Comandos disponibles')
      .setColor('#00AAFF')
      .setDescription('Lista de comandos disponibles y su función:')
      .addField('!ping', 'Muestra tu ping aproximado, latencia del bot y tiempo restante antes del apagado.')
      .addField('!testa', 'Envía un recordatorio de prueba en el canal configurado.')
      .addField('!testr', 'Envía un mensaje de prueba indicando que el bot se ha reiniciado.')
      .setFooter('Usa los comandos con el prefijo "!".')
      .setTimestamp();

    msg.channel.send(helpEmbed);
  }
});

client.login(process.env.TOKEN);

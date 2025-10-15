// index.js — compatible con discord.js v14 🎃

const {
	Client,
	GatewayIntentBits,
	EmbedBuilder,
	Events
} = require('discord.js');

// ======================================================
// 🔧 Configuración
const CANAL_ID = '1401680611810476082'; // Canal de avisos
const ROL_ID = '1390189325244829737';   // Rol a mencionar
// ======================================================

// ======================================================
// 📦 Módulo Carnaval
const carnaval = require('./carnaval.js'); // mantiene el módulo externo
// ======================================================

// ======================================================
// 🤖 Crear cliente
const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent,
	],
});
// ======================================================

// ======================================================
// 📌 Función: enviar anuncio de encendido (ready y !testr)
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

// ======================================================
// 📌 Evento Ready
client.once(Events.ClientReady, async () => {
	console.log(`✅ Bot activo como ${client.user.tag}`);
	client.canal = client.channels.cache.get(CANAL_ID) || await client.channels.fetch(CANAL_ID).catch(() => null);
	await sendStartupAnnouncement();
});
// ======================================================

// ======================================================
// 📌 Evento MessageCreate
client.on(Events.MessageCreate, async (msg) => {
	try {
		// primero, pasar el mensaje a carnaval.js
		if (typeof carnaval.handleMessage === 'function') {
			await carnaval.handleMessage(msg);
		}

		if (msg.author.bot) return;

		// ==========================
		// ⚙️ Comando !ping
		// ==========================
		if (msg.content === '!ping') {
			const sent = await msg.channel.send('Calculando información...').catch(() => null);
			const latencyMessage = sent ? (sent.createdTimestamp - msg.createdTimestamp) : 'N/A';
			const latencyAPI = Math.round(client.ws.ping);

			const embed = new EmbedBuilder()
				.setTitle('🎃🏓 Info del bot (Halloween)')
				.setColor('#8B0000')
				.setDescription('Datos del bot — ¡mira bajo la luz de la luna!')
				.addFields(
					{ name: 'API (latencia)', value: `${latencyAPI} ms`, inline: true },
					{ name: 'Mi Ping', value: `${latencyMessage} ms`, inline: true },
					{ name: 'Nota', value: 'Este servidor está protegido por sombras. Usa los comandos con cuidado.', inline: false },
				)
				.setThumbnail(msg.author.displayAvatarURL({ dynamic: true, size: 64 }))
				.setFooter({ text: '🦇 Comando: !ping' })
				.setTimestamp();

			if (sent) await sent.edit({ content: '', embeds: [embed] }).catch(() => msg.channel.send({ embeds: [embed] }));
			else msg.channel.send({ embeds: [embed] });
			return;
		}

		// ==========================
		// ⚙️ Comando !testr
		// ==========================
		if (msg.content === '!testr') {
			await sendStartupAnnouncement();
			await msg.reply('Test reinicio enviado.').catch(() => msg.channel.send('Test reinicio enviado.'));
			return;
		}

		// ==========================
		// ⚙️ Comando !help
		// ==========================
		if (msg.content === '!help') {
			const helpEmbed = new EmbedBuilder()
				.setTitle('📖 Comandos disponibles — Edición Tenebrosa')
				.setColor('#6A0DAD')
				.setDescription('Lista de comandos disponibles — ¡échale un vistazo bajo la luz de la luna! 🎃')
				.addFields(
					{ name: '!ping', value: 'Muestra latencia del bot.', inline: false },
					{ name: '!testr', value: 'Envía un test de reinicio (anuncio de encendido).', inline: false },
					{ name: '!help', value: 'Muestra este mensaje de ayuda.', inline: false }
				)
				.setFooter({ text: 'Usa los comandos con el prefijo "!". 🦇' })
				.setThumbnail(msg.author.displayAvatarURL({ dynamic: true, size: 64 }))
				.setTimestamp();

			await msg.channel.send({ embeds: [helpEmbed] });
			return;
		}
	} catch (err) {
		console.error('Error procesando mensaje:', err);
	}
});
// ======================================================

// ======================================================
// 📌 Login (token desde variables de entorno)
client.login(process.env.TOKEN);
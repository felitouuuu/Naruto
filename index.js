// index.js — compatible con discord.js v14 🎃
const {
	Client,
	GatewayIntentBits,
	EmbedBuilder,
	Events,
	SlashCommandBuilder,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	InteractionType
} = require('discord.js');

const CANAL_ID = '1401680611810476082';
const ROL_ID = '1390189325244829737';

let PREFIX = '!'; // Prefijo inicial

// Crear cliente
const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent,
	],
});

// Enviar anuncio de encendido
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

// Evento Ready
client.once(Events.ClientReady, async () => {
	console.log(`✅ Bot activo como ${client.user.tag}`);
	client.canal = client.channels.cache.get(CANAL_ID) || await client.channels.fetch(CANAL_ID).catch(() => null);
	await sendStartupAnnouncement();

	// Registrar comandos slash
	const commands = [
		new SlashCommandBuilder().setName('ping').setDescription('Muestra latencia del bot.'),
		new SlashCommandBuilder().setName('testr').setDescription('Envía un test de reinicio (anuncio de encendido).'),
		new SlashCommandBuilder().setName('help').setDescription('Muestra el mensaje de ayuda.'),
		new SlashCommandBuilder()
			.setName('setprefix')
			.setDescription('Cambia el prefijo de comandos del bot.')
			.addStringOption(opt => opt.setName('prefix').setDescription('Nuevo prefijo').setRequired(true))
	].map(cmd => cmd.toJSON());

	await client.application.commands.set(commands);
});

// Manejo de mensajes con prefijo
client.on(Events.MessageCreate, async (msg) => {
	if (msg.author.bot) return;
	if (!msg.content.startsWith(PREFIX)) return;

	const args = msg.content.slice(PREFIX.length).trim().split(/ +/);
	const command = args.shift().toLowerCase();

	try {
		if (command === 'ping') {
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
				.setFooter({ text: `🦇 Comando: ${PREFIX}ping` })
				.setTimestamp();

			if (sent) await sent.edit({ content: '', embeds: [embed] }).catch(() => msg.channel.send({ embeds: [embed] }));
			else msg.channel.send({ embeds: [embed] });
		} else if (command === 'testr') {
			await sendStartupAnnouncement();
			await msg.reply('Test reinicio enviado.').catch(() => msg.channel.send('Test reinicio enviado.'));
		} else if (command === 'help') {
			const helpEmbed = new EmbedBuilder()
				.setTitle('📖 Comandos disponibles — Edición Tenebrosa')
				.setColor('#6A0DAD')
				.setDescription('Lista de comandos disponibles — ¡échale un vistazo bajo la luz de la luna! 🎃')
				.addFields(
					{ name: `${PREFIX}ping`, value: 'Muestra latencia del bot.', inline: false },
					{ name: `${PREFIX}testr`, value: 'Envía un test de reinicio (anuncio de encendido).', inline: false },
					{ name: `${PREFIX}help`, value: 'Muestra este mensaje de ayuda.', inline: false },
					{ name: `${PREFIX}setprefix <nuevo>`, value: 'Cambia el prefijo de comandos.', inline: false }
				)
				.setFooter({ text: `Usa los comandos con el prefijo "${PREFIX}". 🦇` })
				.setThumbnail(msg.author.displayAvatarURL({ dynamic: true, size: 64 }))
				.setTimestamp();

			await msg.channel.send({ embeds: [helpEmbed] });
		} else if (command === 'setprefix') {
			const newPrefix = args[0];
			if (!newPrefix) return msg.reply('Debes especificar un nuevo prefijo.');
			PREFIX = newPrefix;
			await msg.reply(`Prefijo actualizado a: \`${PREFIX}\``);
		}
	} catch (err) {
		console.error('Error procesando mensaje:', err);
	}
});

// Manejo de interacciones slash
client.on(Events.InteractionCreate, async (interaction) => {
	if (!interaction.isChatInputCommand()) return;

	try {
		if (interaction.commandName === 'ping') {
			const latencyAPI = Math.round(client.ws.ping);
			const embed = new EmbedBuilder()
				.setTitle('🎃🏓 Info del bot (Halloween)')
				.setColor('#8B0000')
				.setDescription('Datos del bot — ¡mira bajo la luz de la luna!')
				.addFields(
					{ name: 'API (latencia)', value: `${latencyAPI} ms`, inline: true }
				)
				.setTimestamp();
			await interaction.reply({ embeds: [embed] });
		} else if (interaction.commandName === 'testr') {
			await sendStartupAnnouncement();
			await interaction.reply('Test reinicio enviado.');
		} else if (interaction.commandName === 'help') {
			const helpEmbed = new EmbedBuilder()
				.setTitle('📖 Comandos disponibles — Edición Tenebrosa')
				.setColor('#6A0DAD')
				.setDescription('Lista de comandos disponibles — ¡échale un vistazo bajo la luz de la luna! 🎃')
				.addFields(
					{ name: '/ping', value: 'Muestra latencia del bot.', inline: false },
					{ name: '/testr', value: 'Envía un test de reinicio (anuncio de encendido).', inline: false },
					{ name: '/help', value: 'Muestra este mensaje de ayuda.', inline: false },
					{ name: '/setprefix', value: 'Cambia el prefijo de comandos.', inline: false }
				);

			const row = new ActionRowBuilder()
				.addComponents(
					new ButtonBuilder()
						.setCustomId('help_next')
						.setLabel('Siguiente sección')
						.setStyle(ButtonStyle.Primary)
				);

			await interaction.reply({ embeds: [helpEmbed], components: [row] });
		} else if (interaction.commandName === 'setprefix') {
			const newPrefix = interaction.options.getString('prefix');
			PREFIX = newPrefix;
			await interaction.reply(`Prefijo actualizado a: \`${PREFIX}\``);
		}
	} catch (err) {
		console.error(err);
	}
});

// Manejo de botón para help
client.on(Events.InteractionCreate, async (interaction) => {
	if (!interaction.isButton()) return;
	if (interaction.customId === 'help_next') {
		const secondEmbed = new EmbedBuilder()
			.setTitle('📖 Segunda sección de comandos')
			.setColor('#6A0DAD')
			.setDescription('Aquí podrías añadir comandos avanzados o información extra.');
		await interaction.update({ embeds: [secondEmbed], components: [] });
	}
});

// Login
client.login(process.env.TOKEN);
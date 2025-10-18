const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Events, Collection, REST, Routes } = require('discord.js');

const CANAL_ID = '1401680611810476082';
const ROL_ID = '1390189325244829737';

const client = new Client({
	intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

client.PREFIX = '!';
client.commands = new Collection();
client.commands.categories = {
	Configuración: ['setprefix'],
	Información: ['ping', 'testr', 'help']
};

// Cargar comandos
const commandFiles = fs.readdirSync(__dirname).filter(f => f.endsWith('.js') && f !== 'index.js' && f !== 'package.json');
for (const file of commandFiles) {
	const cmd = require(`./${file}`);
	if (cmd.name) client.commands.set(cmd.name, cmd);
}

// Función segura de registro
async function registerSlashCommandsSafe() {
	const commandsData = [];
	for (const cmd of client.commands.values()) {
		if (cmd.data) commandsData.push(cmd.data.toJSON());
	}

	const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
	try {
		console.log('🌀 Verificando comandos slash...');

		// Obtenemos los comandos existentes
		const existing = await rest.get(
			Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID)
		);

		const changed = existing.length !== commandsData.length;
		if (!changed) {
			console.log('✅ Los comandos slash ya están actualizados.');
			return;
		}

		console.log(`🔄 Registrando ${commandsData.length} comandos nuevos...`);
		await rest.put(
			Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
			{ body: commandsData }
		);
		console.log('✅ Comandos slash registrados correctamente.');
	} catch (err) {
		console.error('⚠️ Error registrando comandos slash:', err.message);
	}
}

// Enviar anuncio de encendido
async function sendStartupAnnouncement() {
	try {
		const ch = client.channels.cache.get(CANAL_ID) || await client.channels.fetch(CANAL_ID).catch(() => null);
		if (!ch) return;
		await ch.send(`<@&${ROL_ID}> ✅ El bot se ha reiniciado y está listo para probar los nuevos ajustes.`);
	} catch (err) {
		console.error('Error enviando anuncio de inicio:', err);
	}
}

// Evento ready
client.once(Events.ClientReady, async () => {
	console.log(`✅ Bot activo como ${client.user.tag}`);
	registerSlashCommandsSafe(); // se ejecuta sin bloquear el inicio
	sendStartupAnnouncement();
});

// Prefijo
client.on(Events.MessageCreate, async msg => {
	if (!msg.content.startsWith(client.PREFIX) || msg.author.bot) return;
	const args = msg.content.slice(client.PREFIX.length).trim().split(/ +/);
	const commandName = args.shift().toLowerCase();
	const command = client.commands.get(commandName);
	if (!command) return;
	await command.executeMessage(msg, args);
});

// Slash + interacciones
client.on(Events.InteractionCreate, async interaction => {
	if (interaction.isChatInputCommand()) {
		const command = client.commands.get(interaction.commandName);
		if (!command) return;
		await command.executeInteraction(interaction);
	}
	if (interaction.isStringSelectMenu() || interaction.isButton()) {
		const helpCommand = client.commands.get('help');
		if (helpCommand?.handleInteraction) await helpCommand.handleInteraction(interaction);
	}
});

client.login(process.env.TOKEN);
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Events, Collection } = require('discord.js');

const CANAL_ID = '1401680611810476082'; // Canal de anuncios
const ROL_ID = '1390189325244829737';   // Rol a mencionar

const client = new Client({ 
	intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

client.PREFIX = '!';
client.commands = new Collection();

// ------------------ CARGA DE COMANDOS ------------------
const commandFiles = fs.readdirSync(path.join(__dirname, './commands')).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
	const cmd = require(`./commands/${file}`);
	if (cmd.name) client.commands.set(cmd.name, cmd);
}

// ------------------ MENSAJE DE ENCENDIDO ------------------
async function sendStartupAnnouncement() {
	try {
		const ch = client.channels.cache.get(CANAL_ID) || await client.channels.fetch(CANAL_ID).catch(() => null);
		if (!ch) return;
		const msg = `<@&${ROL_ID}> ✅ El bot se ha reiniciado y está listo.`;
		await ch.send(msg).catch(() => {});
	} catch (err) {
		console.error('Error enviando anuncio de inicio:', err);
	}
}

// ------------------ EVENTO READY ------------------
client.once(Events.ClientReady, async () => {
	console.log(`✅ Bot activo como ${client.user.tag}`);
	await sendStartupAnnouncement();
});

// ------------------ PREFIJO ------------------
client.on(Events.MessageCreate, async msg => {
	if (!msg.content.startsWith(client.PREFIX) || msg.author.bot) return;
	const args = msg.content.slice(client.PREFIX.length).trim().split(/ +/);
	const commandName = args.shift().toLowerCase();
	const command = client.commands.get(commandName);
	if (!command) return;
	await command.executeMessage(msg, args);
});

// ------------------ SLASH / INTERACCIONES ------------------
client.on(Events.InteractionCreate, async interaction => {
	if (interaction.isChatInputCommand()) {
		const command = client.commands.get(interaction.commandName);
		if (!command) return;
		await command.executeInteraction(interaction);
	}

	if (interaction.isStringSelectMenu() || interaction.isButton()) {
		const helpCommand = client.commands.get('help');
		if (helpCommand && helpCommand.handleInteraction) {
			await helpCommand.handleInteraction(interaction);
		}
	}
});

client.login(process.env.TOKEN);
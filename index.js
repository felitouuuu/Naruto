const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Events, Collection } = require('discord.js');

const client = new Client({ 
	intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

client.PREFIX = '!';
client.commands = new Collection();

// Cargar comandos
const commandFiles = fs.readdirSync(path.join(__dirname, './')).filter(f => f.endsWith('.js') && f !== 'index.js' && f !== 'package.json');

for (const file of commandFiles) {
	const cmd = require(`./${file}`);
	if (cmd.name) client.commands.set(cmd.name, cmd);
}

// Manejo de prefijo
client.on(Events.MessageCreate, async msg => {
	if (!msg.content.startsWith(client.PREFIX) || msg.author.bot) return;
	const args = msg.content.slice(client.PREFIX.length).trim().split(/ +/);
	const commandName = args.shift().toLowerCase();
	const command = client.commands.get(commandName);
	if (!command) return;

	await command.executeMessage(msg, args);
});

// Manejo de slash
client.on(Events.InteractionCreate, async interaction => {
	if (!interaction.isChatInputCommand()) return;
	const command = client.commands.get(interaction.commandName);
	if (!command) return;

	await command.executeInteraction(interaction);
});

// Login
client.login(process.env.TOKEN);
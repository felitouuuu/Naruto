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

// Cargar comandos
const commandFiles = fs.readdirSync(path.join(__dirname, './commands')).filter(f => f.endsWith('.js'));
for (const file of commandFiles) {
    const cmd = require(`./commands/${file}`);
    if (cmd.name) client.commands.set(cmd.name, cmd);
}

// Registrar slash commands
async function registerSlashCommands() {
    const commandsData = [];
    for (const cmd of client.commands.values()) {
        if (cmd.data && typeof cmd.data.toJSON === 'function') commandsData.push(cmd.data.toJSON());
    }

    if (!commandsData.length) return;

    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        console.log(`🔄 Registrando ${commandsData.length} comandos slash...`);
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commandsData }
        );
        console.log('✅ Comandos slash registrados.');
    } catch (err) {
        console.error('❌ Error registrando comandos slash:', err);
    }
}

// Anuncio de inicio
async function sendStartupAnnouncement() {
    try {
        const ch = client.channels.cache.get(CANAL_ID) || await client.channels.fetch(CANAL_ID).catch(() => null);
        if (!ch) return;
        await ch.send(`<@&${ROL_ID}> ✅ El bot se ha reiniciado y está listo.`);
    } catch (err) {
        console.error('Error enviando anuncio de inicio:', err);
    }
}

client.once(Events.ClientReady, async () => {
    console.log(`✅ Bot activo como ${client.user.tag}`);
    await registerSlashCommands();
    await sendStartupAnnouncement();
});

client.on(Events.MessageCreate, async msg => {
    if (!msg.content.startsWith(client.PREFIX) || msg.author.bot) return;
    const args = msg.content.slice(client.PREFIX.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();
    const command = client.commands.get(commandName);
    if (!command) return;
    await command.executeMessage(msg, args);
});

client.on(Events.InteractionCreate, async interaction => {
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;
        await command.executeInteraction(interaction);
    }

    if (interaction.isStringSelectMenu() || interaction.isButton()) {
        const helpCommand = client.commands.get('help');
        if (helpCommand && helpCommand.handleInteraction) await helpCommand.handleInteraction(interaction);
    }
});

client.login(process.env.TOKEN);
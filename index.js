// index.js
const fs = require('fs');
const path = require('path');
const {
  Client,
  GatewayIntentBits,
  Events,
  Collection,
  REST,
  Routes,
} = require('discord.js');

const CANAL_ID = '1401680611810476082';
const ROL_ID = '1390189325244829737';
const OWNER_ID = '1003512479277662208';
const TEST_GUILD_ID = '1390187634093199461';
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

client.commands = new Collection();
client.prefixesFile = path.join(__dirname, 'prefixes.json');

// =================== PREFIJOS ===================
function loadPrefixes() {
  try {
    if (!fs.existsSync(client.prefixesFile)) fs.writeFileSync(client.prefixesFile, JSON.stringify({}), 'utf8');
    const raw = fs.readFileSync(client.prefixesFile, 'utf8');
    client._prefixes = JSON.parse(raw || '{}');
  } catch {
    client._prefixes = {};
  }
}
function savePrefixes() {
  try {
    fs.writeFileSync(client.prefixesFile, JSON.stringify(client._prefixes, null, 2), 'utf8');
  } catch {}
}
loadPrefixes();

client.getPrefix = (guildId) => {
  if (!guildId) return '!';
  return client._prefixes[guildId] || '!';
};
client.setPrefix = (guildId, newPrefix) => {
  if (!guildId) return;
  client._prefixes[guildId] = newPrefix;
  savePrefixes();
  return newPrefix;
};

// =================== CARGAR COMANDOS ===================
const commandsPath = path.join(__dirname, 'commands');
if (!fs.existsSync(commandsPath)) fs.mkdirSync(commandsPath);
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
for (const file of commandFiles) {
  const cmd = require(path.join(commandsPath, file));
  if (cmd && cmd.name) client.commands.set(cmd.name, cmd);
}

// =================== REGISTRAR SLASH ===================
async function registerSlashCommands() {
  if (!TOKEN || !CLIENT_ID) return;

  const rest = new REST({ version: '10' }).setToken(TOKEN);
  const globalCmds = [];
  let testrCmdData = null;

  for (const cmd of client.commands.values()) {
    if (!cmd.data) continue;
    if (cmd.name === 'testr') testrCmdData = cmd.data.toJSON();
    else globalCmds.push(cmd.data.toJSON());
  }

  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: globalCmds });
    if (testrCmdData) {
      const created = await rest.put(Routes.applicationGuildCommands(CLIENT_ID, TEST_GUILD_ID), { body: [testrCmdData] });
      const createdCmd = Array.isArray(created) ? created[0] : created;
      if (createdCmd && createdCmd.id) {
        const permissions = [{ id: OWNER_ID, type: 2, permission: true }];
        await rest.put(Routes.applicationGuildCommandPermissions(CLIENT_ID, TEST_GUILD_ID, createdCmd.id), { body: { permissions } });
      }
    }
    console.log('✅ Slash commands registrados.');
  } catch (err) {
    console.error('❌ Error registrando slash commands:', err);
  }
}

// =================== READY ===================
client.once(Events.ClientReady, async () => {
  console.log(`✅ Bot activo como ${client.user.tag}`);
  await registerSlashCommands();

  const ch = await client.channels.fetch(CANAL_ID).catch(() => null);
  if (ch) ch.send(`<@&${ROL_ID}> ✅ El bot se ha reiniciado y está listo para usar.`);
});

// =================== MENSAJES ===================
client.on(Events.MessageCreate, async msg => {
  if (!msg.guild || msg.author.bot) return;
  const prefix = client.getPrefix(msg.guild.id);
  if (!msg.content.startsWith(prefix)) return;

  const args = msg.content.slice(prefix.length).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();
  const command = client.commands.get(commandName);
  if (!command) return;

  if (commandName === 'testr' && (msg.author.id !== OWNER_ID || msg.guild.id !== TEST_GUILD_ID)) return;
  await command.executeMessage(msg, args, prefix);
});

// =================== INTERACCIONES ===================
client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isAutocomplete()) {
    const cmd = client.commands.get(interaction.commandName);
    if (cmd && cmd.autocomplete) await cmd.autocomplete(interaction);
    return;
  }

  if (interaction.isStringSelectMenu() || interaction.isButton()) {
    const helpCmd = client.commands.get('help');
    if (helpCmd && helpCmd.handleInteraction) return helpCmd.handleInteraction(interaction);
  }

  if (!interaction.isChatInputCommand()) return;
  const cmd = client.commands.get(interaction.commandName);
  if (!cmd) return interaction.reply({ content: 'Comando no existe.', ephemeral: true });

  if (interaction.commandName === 'testr' && (interaction.user.id !== OWNER_ID || interaction.guildId !== TEST_GUILD_ID))
    return interaction.reply({ content: 'Comando no existe.', ephemeral: true });

  await cmd.executeInteraction(interaction);
});

client.login(TOKEN);

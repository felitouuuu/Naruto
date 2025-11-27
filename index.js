require('dotenv').config();

const fs = require('fs');
const path = require('path');
const db = require('./database');
const dbhelper = require('./dbhelper');
const runMigrations = require('./migrations');

const {
  Client,
  GatewayIntentBits,
  Events,
  Collection,
  REST,
  Routes,
  EmbedBuilder
} = require('discord.js');

const CANAL_ID = '1401680611810476082';
const ROL_ID = '1390189325244829737';
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
});

client.commands = new Collection();
client.prefixesFile = path.join(__dirname, 'prefixes.json');

// =================== PREFIJOS (en memoria) ===================
// Mantenemos un cache en client._prefixes (se cargará desde DB en ready)
client._prefixes = {};

// getPrefix: síncrono (lee cache)
client.getPrefix = (guildId) => {
  if (!guildId) return '!';
  return client._prefixes[guildId] || '!';
};

// setPrefix: actualiza cache y persiste en DB asincrónicamente
client.setPrefix = (guildId, newPrefix) => {
  if (!guildId) return;
  client._prefixes[guildId] = newPrefix;
  // persistir en background (no bloquear)
  dbhelper.setPrefix(guildId, newPrefix).catch(err => {
    console.error('❌ Error guardando prefijo en DB:', err);
  });
  return newPrefix;
};

// backward-compatible: mantener escritura local opcional (no necesaria pero por seguridad)
function savePrefixesLocal() {
  try {
    fs.writeFileSync(client.prefixesFile, JSON.stringify(client._prefixes, null, 2), 'utf8');
  } catch (e) {}
}

// =================== CARGAR COMANDOS ===================
const commandsPath = path.join(__dirname, 'commands');
if (!fs.existsSync(commandsPath)) fs.mkdirSync(commandsPath);

const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
  const cmd = require(path.join(commandsPath, file));
  if (cmd && cmd.name) client.commands.set(cmd.name, cmd);
}

// =================== MONITORES ===================
let startValueMonitor;
try {
  startValueMonitor = require('./utils/valueMonitor');
} catch {
  startValueMonitor = null;
}

// =================== REGISTRAR SLASH ===================
async function registerSlashCommands() {
  if (!TOKEN || !CLIENT_ID) return;
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  const globalCmds = [];

  for (const cmd of client.commands.values()) {
    if (cmd.data) globalCmds.push(cmd.data.toJSON());
  }

  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: globalCmds });
    console.log('✅ Slash commands registrados');
  } catch (err) {
    console.error('❌ Error registrando slash commands:', err);
  }
}

// =================== READY ===================
client.once(Events.ClientReady, async () => {
  console.log(`✅ Bot activo como ${client.user.tag}`);

  await registerSlashCommands();

  // Ejecutar migrations ( crear tablas )
  try {
    await runMigrations();
  } catch (err) {
    console.error('❌ Error en migrations:', err);
  }

  // Cargar prefixes desde la DB al cache
  try {
    const map = await dbhelper.loadAllPrefixes();
    client._prefixes = Object.assign({}, client._prefixes, map);
    // opcional: también dejar un snapshot local para debugging
    savePrefixesLocal();
    console.log('✅ Prefijos cargados desde DB, total:', Object.keys(client._prefixes).length);
  } catch (err) {
    console.error('❌ Error cargando prefijos desde DB:', err);
  }

  // Iniciar monitor de valores
  if (typeof startValueMonitor === 'function') {
    try {
      startValueMonitor(client);
      console.log('✅ ValueMonitor iniciado');
    } catch (err) {
      console.error('❌ Error iniciando ValueMonitor:', err);
    }
  }

  // Mensaje al canal
  const ch = await client.channels.fetch(CANAL_ID).catch(() => null);
  if (ch) ch.send(`<@&${ROL_ID}> ✅ El bot se reinició y está listo`);

  // Probar DB
  try {
    const test = await db.query('SELECT NOW()');
    console.log('📌 DB Conectada:', test.rows[0]);
  } catch (err) {
    console.error('❌ Error conectando a la DB:', err);
  }
});

// =================== MENSAJES ===================
client.on(Events.MessageCreate, async msg => {
  if (!msg.guild || msg.author.bot) return;

  const prefix = client.getPrefix(msg.guild.id);
  const botMention = `<@${client.user.id}>`;
  const clean = msg.content.trim();

  if (clean === botMention) {
    const embed = new EmbedBuilder()
      .setDescription(
        `**Hola ${msg.author.displayName} 👋**\n` +
        `Mi prefijo aquí es **${prefix}**.\n` +
        `Usa **${prefix}help** para ver comandos.`
      )
      .setColor('#6A0DAD');

    return msg.reply({ embeds: [embed] });
  }

  if (clean.startsWith(botMention)) {
    const args = clean.slice(botMention.length).trim().split(/ +/);
    const cmdName = args.shift()?.toLowerCase();
    const command = client.commands.get(cmdName);
    if (command) return command.executeMessage(msg, args);
  }

  if (!clean.startsWith(prefix)) return;

  const args = clean.slice(prefix.length).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();
  const command = client.commands.get(commandName);
  if (!command) return;

  await command.executeMessage(msg, args, prefix);
});

// =================== INTERACCIONES ===================
client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isAutocomplete()) {
    const cmd = client.commands.get(interaction.commandName);
    if (cmd && cmd.autocomplete) return cmd.autocomplete(interaction);
  }

  if (interaction.isStringSelectMenu() || interaction.isButton()) {
    const helpCmd = client.commands.get('help');
    if (helpCmd && helpCmd.handleInteraction)
      return helpCmd.handleInteraction(interaction);
  }

  if (!interaction.isChatInputCommand()) return;

  const cmd = client.commands.get(interaction.commandName);
  if (!cmd)
    return interaction.reply({ content: 'Comando no existe.', ephemeral: true });

  await cmd.executeInteraction(interaction);
});

client.login(TOKEN);
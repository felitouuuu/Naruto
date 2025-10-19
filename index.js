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
  PermissionsBitField
} = require('discord.js');

const CANAL_ID = '1401680611810476082';
const ROL_ID = '1390189325244829737';

const OWNER_ID = '1003512479277662208';       // tu id (solo tú)
const TEST_GUILD_ID = '1390187634093199461';  // servidor de pruebas (solo aquí estará /testr)

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.commands = new Collection();
client.prefixesFile = path.join(__dirname, 'prefixes.json');

// cargar prefijos (o crear archivo si no existe)
function loadPrefixes() {
  try {
    if (!fs.existsSync(client.prefixesFile)) {
      fs.writeFileSync(client.prefixesFile, JSON.stringify({}), 'utf8');
    }
    const raw = fs.readFileSync(client.prefixesFile, 'utf8');
    client._prefixes = JSON.parse(raw || '{}');
  } catch (err) {
    console.error('Error leyendo prefixes.json:', err);
    client._prefixes = {};
  }
}
function savePrefixes() {
  try {
    fs.writeFileSync(client.prefixesFile, JSON.stringify(client._prefixes, null, 2), 'utf8');
  } catch (err) {
    console.error('Error guardando prefixes.json:', err);
  }
}
loadPrefixes();

// helpers para prefijo por guild
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

// cargar comandos desde ./commands
const commandsPath = path.join(__dirname, 'commands');
if (!fs.existsSync(commandsPath)) fs.mkdirSync(commandsPath);
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
for (const file of commandFiles) {
  try {
    const cmd = require(path.join(commandsPath, file));
    if (cmd && cmd.name) client.commands.set(cmd.name, cmd);
  } catch (err) {
    console.error('Error cargando comando', file, err);
  }
}

// registra slash commands: global para todos excepto 'testr', y guild-only para testr
async function registerSlashCommands() {
  if (!TOKEN || !CLIENT_ID) {
    console.warn('No se registraron comandos slash: faltan TOKEN/CLIENT_ID en env.');
    return;
  }

  const rest = new REST({ version: '10' }).setToken(TOKEN);

  // preparar globales (todos los cmd con cmd.data, excepto 'testr')
  const globalCmds = [];
  let testrCmdData = null;
  for (const cmd of client.commands.values()) {
    if (!cmd.data) continue;
    if (cmd.name === 'testr') {
      testrCmdData = cmd.data.toJSON();
    } else {
      globalCmds.push(cmd.data.toJSON());
    }
  }

  try {
    // registrar globales (reemplaza los existentes globales)
    console.log(`🔄 Registrando ${globalCmds.length} comandos globales...`);
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: globalCmds });

    // si hay testr, registrarlo SOLO en TEST_GUILD_ID
    if (testrCmdData) {
      console.log('🔄 Registrando /testr en la guild de pruebas...');
      const created = await rest.put(
        Routes.applicationGuildCommands(CLIENT_ID, TEST_GUILD_ID),
        { body: [testrCmdData] }
      );

      // created es array con el comando creado; obtener id
      const createdCmd = Array.isArray(created) ? created[0] : created;
      if (createdCmd && createdCmd.id) {
        // establecer permisos para que SOLO OWNER_ID pueda usarlo (y verlo)
        // permisos: type 2 = USER, permission true
        const permissions = [
          { id: OWNER_ID, type: 2, permission: true }
        ];
        try {
          await rest.put(
            Routes.applicationGuildCommandPermissions(CLIENT_ID, TEST_GUILD_ID, createdCmd.id),
            { body: { permissions } }
          );
          console.log('🔒 Permisos aplicados a /testr (solo owner).');
        } catch (permErr) {
          console.warn('No se pudieron aplicar permisos a /testr:', permErr);
        }
      }
    }

    console.log('✅ Registro de slash commands completado.');
  } catch (err) {
    console.error('❌ Error registrando slash commands:', err);
  }
}

// startup announcement
async function sendStartupAnnouncement() {
  try {
    const ch = client.channels.cache.get(CANAL_ID) || await client.channels.fetch(CANAL_ID).catch(() => null);
    if (!ch) return;
    await ch.send(`<@&${ROL_ID}> ✅ El bot se ha reiniciado y está listo para usar.`).catch(() => {});
  } catch (err) {
    console.error('Error enviando anuncio de inicio:', err);
  }
}

client.once(Events.ClientReady, async () => {
  console.log(`✅ Bot activo como ${client.user.tag}`);
  // registrar comandos slash
  await registerSlashCommands();
  await sendStartupAnnouncement();
});

// mensajes con prefijo por server
client.on(Events.MessageCreate, async (msg) => {
  try {
    if (msg.author.bot) return;
    const prefix = client.getPrefix(msg.guild?.id);
    if (!msg.content.startsWith(prefix)) return;

    const args = msg.content.slice(prefix.length).trim().split(/ +/);
    const name = args.shift().toLowerCase();

    // si es testr y no es el owner en test guild -> fingimos que no existe
    if (name === 'testr') {
      const isOwner = msg.author.id === OWNER_ID && msg.guild && msg.guild.id === TEST_GUILD_ID;
      if (!isOwner) return; // ignora (mensaje no responde)
    }

    const command = client.commands.get(name);
    if (!command) return;
    await command.executeMessage(msg, args);
  } catch (err) {
    console.error('Error manejando MessageCreate:', err);
  }
});

// interacción slash
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // menú / botones (help)
    if (interaction.isStringSelectMenu() || interaction.isButton()) {
      const helpCmd = client.commands.get('help');
      if (helpCmd && helpCmd.handleInteraction) {
        return await helpCmd.handleInteraction(interaction);
      }
    }

    if (!interaction.isChatInputCommand()) return;

    const cmdName = interaction.commandName;
    const cmd = client.commands.get(cmdName);

    // Si es testr en guild distinto o usuario distinto: responder "Comando no existe"
    if (cmdName === 'testr') {
      const isOwner = interaction.user.id === OWNER_ID && interaction.guild && interaction.guild.id === TEST_GUILD_ID;
      if (!isOwner) {
        return interaction.reply({ content: 'Comando no existe.', ephemeral: true });
      }
    }

    if (!cmd || !cmd.executeInteraction) {
      return interaction.reply({ content: 'Comando no existe.', ephemeral: true });
    }

    await cmd.executeInteraction(interaction);
  } catch (err) {
    console.error('Error manejando InteractionCreate:', err);
    if (!interaction.replied && !interaction.deferred) {
      try { await interaction.reply({ content: 'Error interno.', ephemeral: true }); } catch {}
    }
  }
});

client.login(TOKEN);

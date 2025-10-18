const fs = require('fs');
const { Client, GatewayIntentBits, Collection, Events, REST, Routes } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.commands = new Collection();
client.slashCommands = [];
client.prefix = '!';

// Cargar todos los comandos desde la carpeta "commands"
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  client.commands.set(command.name, command);
  if (command.data) client.slashCommands.push(command.data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

client.once(Events.ClientReady, async () => {
  console.log(`✅ Conectado como ${client.user.tag}`);

  // 🔹 Registrar comandos slash solo una vez
  try {
    console.log('🌀 Registrando comandos slash...');
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: client.slashCommands }
    );
    console.log('✅ Slash commands listos.');
  } catch (error) {
    console.error('❌ Error al registrar slash commands:', error.message);
  }
});

// 📌 Prefijo (!)
client.on(Events.MessageCreate, async message => {
  if (!message.content.startsWith(client.prefix) || message.author.bot) return;

  const args = message.content.slice(client.prefix.length).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();
  const command = client.commands.get(commandName);
  if (!command) return;

  try {
    await command.executeMessage(message, args);
  } catch (error) {
    console.error(error);
  }
});

// 📌 Slash (/)
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.executeInteraction(interaction);
  } catch (error) {
    console.error(error);
  }
});

client.login(process.env.TOKEN);
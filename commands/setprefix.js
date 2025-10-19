const fs = require('fs');
const path = require('path');
const { SlashCommandBuilder } = require('discord.js');

const PREFIXES_PATH = path.join(__dirname, '../prefixes.json');

function ensurePrefixesFile() {
  if (!fs.existsSync(PREFIXES_PATH)) {
    fs.writeFileSync(PREFIXES_PATH, JSON.stringify({}, null, 2));
  }
}

function loadPrefixes() {
  ensurePrefixesFile();
  try {
    return JSON.parse(fs.readFileSync(PREFIXES_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function savePrefixes(prefixes) {
  fs.writeFileSync(PREFIXES_PATH, JSON.stringify(prefixes, null, 2));
}

module.exports = {
  name: 'setprefix',
  description: 'Configura el prefix a utilizar en este servidor.',
  categoria: 'Configuración',
  categoriaEmoji: '⚙️',
  ejemplos: ['setprefix <prefix>', 'setprefix', 'setprefix ?'],
  syntax: '<prefix_actual> [comando] <nuevo_prefix>',
  color: '#6A0DAD',

  data: new SlashCommandBuilder()
    .setName('setprefix')
    .setDescription('Cambia el prefijo de comandos.')
    .addStringOption(option =>
      option.setName('prefix')
        .setDescription('El nuevo prefijo que deseas establecer.')
        .setRequired(true)
    ),

  executeMessage: async (msg, args) => {
    const newPrefix = args[0];
    if (!newPrefix) return msg.reply('Debes especificar un prefijo.');

    const prefixes = loadPrefixes();
    prefixes[msg.guild.id] = newPrefix;
    savePrefixes(prefixes);

    msg.client.PREFIX = newPrefix;
    await msg.reply(`✅ Prefijo actualizado a: \`${newPrefix}\``);
  },

  executeInteraction: async (interaction) => {
    const newPrefix = interaction.options.getString('prefix');
    if (!newPrefix)
      return interaction.reply({ content: 'Debes especificar un prefijo.', ephemeral: true });

    const prefixes = loadPrefixes();
    prefixes[interaction.guild.id] = newPrefix;
    savePrefixes(prefixes);

    interaction.client.PREFIX = newPrefix;
    await interaction.reply({ content: `✅ Prefijo actualizado a: \`${newPrefix}\``, ephemeral: true });
  }
};

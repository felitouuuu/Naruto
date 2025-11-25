const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const valueFile = path.join(__dirname, '../utils/valueStore.json');

// Función para cargar configuraciones
function loadValues() {
  if (!fs.existsSync(valueFile)) fs.writeFileSync(valueFile, JSON.stringify({}, null, 2));
  return JSON.parse(fs.readFileSync(valueFile, 'utf8'));
}

module.exports = {
  name: 'listvalue',
  description: 'Muestra todas las monedas configuradas con envíos automáticos.',
  category: 'Criptos',
  ejemplo: 'listvalue',
  syntax: '!listvalue',

  data: new SlashCommandBuilder()
    .setName('listvalue')
    .setDescription('Muestra todas las criptomonedas configuradas con envíos automáticos'),

  // Prefix (!listvalue)
  async executeMessage(msg) {
    const guildId = msg.guild.id;
    const allValues = loadValues();
    const server = allValues[guildId];

    if (!server || Object.keys(server).length === 0) {
      const embed = new EmbedBuilder()
        .setTitle('📭 Sin configuraciones activas')
        .setDescription('No hay monedas enviándose automáticamente en este servidor.')
        .setColor('#6A0DAD');

      return msg.reply({ embeds: [embed] });
    }

    let list = '';
    for (const coin in server) {
      const cfg = server[coin];
      list += `**${coin.toUpperCase()}** — cada **${cfg.interval}m** en <#${cfg.channel}>\n`;
    }

    const embed = new EmbedBuilder()
      .setTitle('📋 Configuraciones de Value Activas')
      .setDescription(list)
      .setColor('#6A0DAD');

    return msg.channel.send({ embeds: [embed] });
  },

  // Slash (/listvalue)
  async executeInteraction(interaction) {
    const guildId = interaction.guild.id;
    const allValues = loadValues();
    const server = allValues[guildId];

    if (!server || Object.keys(server).length === 0) {
      const embed = new EmbedBuilder()
        .setTitle('📭 Sin configuraciones activas')
        .setDescription('No hay monedas enviándose automáticamente en este servidor.')
        .setColor('#6A0DAD');

      return interaction.reply({ embeds: [embed] });
    }

    let list = '';
    for (const coin in server) {
      const cfg = server[coin];
      list += `**${coin.toUpperCase()}** — cada **${cfg.interval}m** en <#${cfg.channel}>\n`;
    }

    const embed = new EmbedBuilder()
      .setTitle('📋 Configuraciones de Value Activas')
      .setDescription(list)
      .setColor('#6A0DAD');

    return interaction.reply({ embeds: [embed] });
  }
};
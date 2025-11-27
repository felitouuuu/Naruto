// commands/prefix.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../database/dbhelper.js'); // <-- IMPORTANTE

module.exports = {
  name: 'prefix',
  categoria: 'Información',
  description: 'Muestra el prefijo configurado en este servidor.',
  ejemplo: 'prefix',

  data: new SlashCommandBuilder()
    .setName('prefix')
    .setDescription('Muestra el prefijo configurado en este servidor'),

  // --- Modo prefijo (!prefix)
  executeMessage: async (msg) => {
    const guildId = msg.guild?.id;
    const prefix = await db.getPrefix(guildId);  // <-- AHORA DESDE SQL
    const botMention = `<@${msg.client.user.id}>`;

    const embed = new EmbedBuilder()
      .setTitle('Prefijo del servidor')
      .setDescription(
        `Mi prefijo aquí es **${prefix}**.\n` +
        `También puedes usar **${botMention}** para ejecutar comandos.`
      )
      .setColor('#6A0DAD')
      .setFooter({ text: msg.client.user.username, iconURL: msg.client.user.displayAvatarURL() });

    await msg.channel.send({ embeds: [embed] });
  },

  // --- Modo slash (/prefix)
  executeInteraction: async (interaction) => {
    const guildId = interaction.guild?.id;
    const prefix = await db.getPrefix(guildId); // <-- AHORA DESDE SQL
    const botMention = `<@${interaction.client.user.id}>`;

    const embed = new EmbedBuilder()
      .setTitle('Prefijo del servidor')
      .setDescription(
        `Mi prefijo aquí es **${prefix}**.\n` +
        `También puedes usar **${botMention}** para ejecutar comandos.`
      )
      .setColor('#6A0DAD')
      .setFooter({ text: interaction.client.user.username, iconURL: interaction.client.user.displayAvatarURL() });

    await interaction.reply({ embeds: [embed], ephemeral: false });
  },
};
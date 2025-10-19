// commands/prefix.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'prefix',
  categoria: 'Información',
  description: 'Muestra el prefijo configurado en este servidor.',
  ejemplo: 'prefix',
  syntax: '!prefix',

  data: new SlashCommandBuilder()
    .setName('prefix')
    .setDescription('Muestra el prefijo configurado en este servidor'),

  // --- Modo prefijo (!prefix)
  executeMessage: async (msg) => {
    const client = msg.client;
    const prefix = client.getPrefix?.(msg.guild?.id) || '!';
    const botMention = `<@${client.user.id}>`;

    const embed = new EmbedBuilder()
      .setTitle('Prefijo')
      .setDescription(
        `Mi prefijo aquí es **${prefix}**.\n` +
        `También puedes usar **${botMention}** para ejecutar comandos.`
      )
      .setColor('#6A0DAD')
      .setFooter({ text: client.user.username, iconURL: client.user.displayAvatarURL() });

    await msg.channel.send({ embeds: [embed] });
  },

  // --- Modo slash (/prefix)
  executeInteraction: async (interaction) => {
    const client = interaction.client;
    const prefix = client.getPrefix?.(interaction.guild?.id) || '!';
    const botMention = `<@${client.user.id}>`;

    const embed = new EmbedBuilder()
      .setTitle('Prefijo')
      .setDescription(
        `Mi prefijo aquí es **${prefix}**.\n` +
        `También puedes usar **${botMention}** para ejecutar comandos.`
      )
      .setColor('#6A0DAD')
      .setFooter({ text: client.user.username, iconURL: client.user.displayAvatarURL() });

    await interaction.reply({ embeds: [embed], ephemeral: false });
  },
};

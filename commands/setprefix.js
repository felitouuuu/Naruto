const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  name: 'setprefix',
  categoria: 'Configuración',
  description: 'Configura el prefijo a utilizar en este servidor.',
  ejemplo: ['setprefix <prefijo>', 'setprefix', 'setprefix ?'],
  syntax: '<prefix_actual> [comando] <nuevo_prefix>',

  data: new SlashCommandBuilder()
    .setName('setprefix')
    .setDescription('Cambia el prefijo de comandos de este servidor.')
    .addStringOption(o =>
      o.setName('prefix')
        .setDescription('Nuevo prefijo (un carácter o palabra corta)')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async executeMessage(msg, args, prefix) {
    if (!msg.member.permissions.has(PermissionFlagsBits.ManageGuild))
      return msg.reply('Necesitas **Gestionar servidor** para cambiar el prefijo.');

    const nuevo = (args[0] || '').trim();
    if (!nuevo) return msg.reply('Debes escribir un prefijo válido. Ej: `setprefix !`');

    msg.client.setPrefix(msg.guild.id, nuevo);
    return msg.reply(`✅ Prefijo actualizado a: \`${nuevo}\``);
  },

  async executeInteraction(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild))
      return interaction.reply({ content: 'Necesitas **Gestionar servidor**.', ephemeral: true });

    const nuevo = interaction.options.getString('prefix', true).trim();
    interaction.client.setPrefix(interaction.guildId, nuevo);
    return interaction.reply({ content: `✅ Prefijo actualizado a: \`${nuevo}\``, ephemeral: true });
  }
};

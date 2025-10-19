// 🛠️ setprefix.js — Cambia el prefijo del servidor
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  name: 'setprefix',
  ejemplo: 'setprefix <prefix>\nsetprefix\nsetprefix ?',
  categoria: 'Configuración',
  description: 'Configura el prefix a utilizar en este servidor.',
  syntax: '<prefix_actual> [comando] <nuevo_prefix>',

  data: new SlashCommandBuilder()
    .setName('setprefix')
    .setDescription('Cambia el prefijo de comandos para este servidor.')
    .addStringOption(option =>
      option
        .setName('prefix')
        .setDescription('El nuevo prefijo que deseas establecer')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  executeMessage: async (msg, args) => {
    if (!msg.member.hasPermission('ADMINISTRATOR'))
      return msg.reply('❌ Solo los administradores pueden cambiar el prefijo.');

    const newPrefix = args[0];
    if (!newPrefix) return msg.reply('Debes especificar un nuevo prefijo.');

    msg.client.setPrefix(msg.guild.id, newPrefix);
    await msg.reply(`✅ Prefijo actualizado a: \`${newPrefix}\``);
  },

  executeInteraction: async (interaction) => {
    if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator))
      return interaction.reply({ content: '❌ Solo los administradores pueden cambiar el prefijo.', ephemeral: true });

    const newPrefix = interaction.options.getString('prefix');
    if (!newPrefix)
      return interaction.reply({ content: 'Debes especificar un nuevo prefijo.', ephemeral: true });

    interaction.client.setPrefix(interaction.guild.id, newPrefix);
    await interaction.reply({ content: `✅ Prefijo actualizado a: \`${newPrefix}\``, ephemeral: true });
  }
};

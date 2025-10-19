const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'setprefix',
  ejemplo: 'setprefix <prefix>\nsetprefix\nsetprefix ?\nsetprefix reset',
  categoria: 'Configuración',
  description: 'Configura el prefix a utilizar en este servidor o restablécelo al valor por defecto (!).',
  syntax: '<prefix_actual> [comando] <nuevo_prefix | reset>',
  data: new SlashCommandBuilder()
    .setName('setprefix')
    .setDescription('Cambia o restablece el prefijo de comandos para este servidor.')
    .addStringOption(option =>
      option.setName('valor')
        .setDescription('El nuevo prefijo o escribe "reset" para restaurar el predeterminado (!)')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  executeMessage: async (msg, args) => {
    const guildId = msg.guild?.id;
    if (!guildId) return msg.reply('❌ Este comando solo puede usarse en servidores.');

    const valor = args[0];
    if (!valor) return msg.reply('Debes especificar un prefijo o escribir `reset` para restablecerlo.');

    if (valor.toLowerCase() === 'reset') {
      msg.client.setPrefix(guildId, '!');
      return msg.reply('✅ El prefijo ha sido restablecido al valor predeterminado: `!`');
    }

    msg.client.setPrefix(guildId, valor);
    return msg.reply(`✅ Prefijo actualizado a: \`${valor}\``);
  },

  executeInteraction: async (interaction) => {
    const guildId = interaction.guild?.id;
    if (!guildId) return interaction.reply({ content: '❌ Este comando solo puede usarse en servidores.', ephemeral: true });

    const valor = interaction.options.getString('valor');

    if (valor.toLowerCase() === 'reset') {
      interaction.client.setPrefix(guildId, '!');
      return interaction.reply({ content: '✅ El prefijo ha sido restablecido al valor predeterminado: `!`', ephemeral: true });
    }

    interaction.client.setPrefix(guildId, valor);
    return interaction.reply({ content: `✅ Prefijo actualizado a: \`${valor}\``, ephemeral: true });
  }
};

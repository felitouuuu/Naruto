// commands/setprefix.js
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const dbhelper = require('../dbhelper');

module.exports = {
  name: 'setprefix',
  ejemplo: 'setprefix <prefix>\nsetprefix reset',
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
      // persistir en DB y cache
      try {
        await dbhelper.setPrefix(guildId, '!');
        msg.client.setPrefix(guildId, '!');
      } catch (err) {
        console.error('Error setPrefix:', err);
      }
      return msg.reply('✅ El prefijo ha sido restablecido al valor predeterminado: `!`');
    }

    try {
      await dbhelper.setPrefix(guildId, valor);
      msg.client.setPrefix(guildId, valor);
    } catch (err) {
      console.error('Error setPrefix:', err);
      return msg.reply('❌ Error guardando prefijo en la DB.');
    }

    return msg.reply(`✅ Prefijo actualizado a: \`${valor}\``);
  },

  executeInteraction: async (interaction) => {
    const guildId = interaction.guild?.id;
    if (!guildId) return interaction.reply({ content: '❌ Este comando solo puede usarse en servidores.', ephemeral: true });

    const valor = interaction.options.getString('valor');

    if (valor.toLowerCase() === 'reset') {
      try {
        await dbhelper.setPrefix(guildId, '!');
        interaction.client.setPrefix(guildId, '!');
      } catch (err) {
        console.error('Error setPrefix (slash):', err);
        return interaction.reply({ content: '❌ Error guardando prefijo en la DB.', ephemeral: true });
      }
      return interaction.reply({ content: '✅ El prefijo ha sido restablecido al valor predeterminado: `!`', ephemeral: true });
    }

    try {
      await dbhelper.setPrefix(guildId, valor);
      interaction.client.setPrefix(guildId, valor);
    } catch (err) {
      console.error('Error setPrefix (slash):', err);
      return interaction.reply({ content: '❌ Error guardando prefijo en la DB.', ephemeral: true });
    }

    return interaction.reply({ content: `✅ Prefijo actualizado a: \`${valor}\``, ephemeral: true });
  }
};
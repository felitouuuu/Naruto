const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const dbhelper = require('../dbhelper.js');

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

  // --- Prefijo (!setprefix)
  executeMessage: async (msg, args) => {
    const guildId = msg.guild?.id;
    if (!guildId) return msg.reply('❌ Este comando solo puede usarse en servidores.');

    // permisos: ManageGuild o Administrator
    const member = msg.member;
    const hasPerm = member?.permissions?.has && (member.permissions.has(PermissionFlagsBits.ManageGuild) || member.permissions.has(PermissionFlagsBits.Administrator));
    if (!hasPerm) {
      const e = new EmbedBuilder()
        .setTitle('Permisos insuficientes')
        .setDescription('Necesitas permisos de **Administrar servidor** para cambiar el prefijo.')
        .setColor('#ED4245');
      return msg.channel.send({ embeds: [e] });
    }

    const valor = args[0];
    if (!valor) return msg.reply('Debes especificar un prefijo o escribir `reset` para restablecerlo.');

    try {
      if (valor.toLowerCase() === 'reset') {
        await dbhelper.setPrefix(guildId, '!');
        msg.client.setPrefix(guildId, '!');
        return msg.reply('✅ El prefijo ha sido restablecido al valor predeterminado: `!`');
      }

      await dbhelper.setPrefix(guildId, valor);
      msg.client.setPrefix(guildId, valor);
      return msg.reply(`✅ Prefijo actualizado a: \`${valor}\``);
    } catch (err) {
      console.error('Error setPrefix:', err);
      return msg.reply('❌ Error guardando prefijo en la DB.');
    }
  },

  // --- Slash (/setprefix)
  executeInteraction: async (interaction) => {
    const guildId = interaction.guild?.id;
    if (!guildId) return interaction.reply({ content: '❌ Este comando solo puede usarse en servidores.', ephemeral: true });

    // Para slash el comando ya tiene permisos por defecto, pero checamos extra por seguridad
    const memberPerms = interaction.memberPermissions;
    const hasPerm = memberPerms && (memberPerms.has(PermissionFlagsBits.ManageGuild) || memberPerms.has(PermissionFlagsBits.Administrator));
    if (!hasPerm) {
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('Permisos insuficientes').setDescription('Necesitas permisos de **Administrar servidor** para cambiar el prefijo.').setColor('#ED4245')], ephemeral: true });
    }

    const valor = interaction.options.getString('valor');
    if (!valor) return interaction.reply({ content: 'Debes especificar un prefijo o escribir `reset` para restablecerlo.', ephemeral: true });

    try {
      if (valor.toLowerCase() === 'reset') {
        await dbhelper.setPrefix(guildId, '!');
        interaction.client.setPrefix(guildId, '!');
        return interaction.reply({ content: '✅ El prefijo ha sido restablecido al valor predeterminado: `!`', ephemeral: true });
      }

      await dbhelper.setPrefix(guildId, valor);
      interaction.client.setPrefix(guildId, valor);
      return interaction.reply({ content: `✅ Prefijo actualizado a: \`${valor}\``, ephemeral: true });
    } catch (err) {
      console.error('Error setPrefix (slash):', err);
      return interaction.reply({ content: '❌ Error guardando prefijo en la DB.', ephemeral: true });
    }
  }
};
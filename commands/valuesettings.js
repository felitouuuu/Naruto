const { EmbedBuilder, SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const dbhelper = require('../dbhelper.js');

function embedError(title, desc) {
  return new EmbedBuilder().setTitle(title).setDescription(desc).setColor('#ED4245');
}
function embedOk(title, desc) {
  return new EmbedBuilder().setTitle(title).setDescription(desc).setColor('#6A0DAD');
}

module.exports = {
  name: 'valuesettings',
  description: 'Gestiona el rol gestor para alertas (set / reset / view).',
  category: 'Criptos',
  ejemplo: 'valuesettings set @Rol\nvaluesettings reset\nvaluesettings view',
  syntax: '<prefix> valuesettings <set/reset/view> [rol]',

  data: new SlashCommandBuilder()
    .setName('valuesettings')
    .setDescription('Gestionar el rol gestor para alertas')
    .addStringOption(opt =>
      opt.setName('action')
        .setDescription('Acción: set | reset | view')
        .setRequired(true)
        .addChoices(
          { name: 'set', value: 'set' },
          { name: 'reset', value: 'reset' },
          { name: 'view', value: 'view' }
        )
    )
    .addRoleOption(opt =>
      opt.setName('role')
        .setDescription('Rol permitido para gestionar alerts')
        .setRequired(false)
    ),

  // =======================
  //        PREFIJO
  // =======================
  async executeMessage(msg, args) {
    const guildId = msg.guild.id;
    const action = (args[0] || '').toLowerCase();

    // VIEW
    if (!action || action === 'view') {
      if (!msg.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return msg.reply({
          embeds: [embedError('Permisos insuficientes', 'Solo administradores pueden ver la configuración.')],
          allowedMentions: { repliedUser: false }
        });
      }

      const settings = await dbhelper.getSettings(guildId);
      const roleId = settings?.managerRole || null;
      const role = roleId ? msg.guild.roles.cache.get(roleId) : null;

      return msg.reply({
        embeds: [embedOk('Configuración actual', `Rol gestor: ${role ? role : '`No configurado`'}`)],
        allowedMentions: { repliedUser: false }
      });
    }

    // SET / RESET requieren admin
    if (!msg.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return msg.channel.send({
        embeds: [embedError('Permisos insuficientes', 'Solo administradores pueden usar esta acción.')]
      });
    }

    // RESET
    if (action === 'reset') {
      await dbhelper.resetManagerRole(guildId);
      return msg.channel.send({
        embeds: [embedOk('Rol gestor eliminado', 'Ahora solo administradores pueden usar los comandos.')]
      });
    }

    // SET
    const mention = msg.mentions.roles.first();
    if (!mention) {
      return msg.channel.send({
        embeds: [embedError('Rol inválido', 'Debes mencionar un rol válido.')]
      });
    }

    await dbhelper.setManagerRole(guildId, mention.id);

    return msg.channel.send({
      embeds: [embedOk('Rol configurado', `Nuevo rol gestor: ${mention}`)]
    });
  },

  // =======================
  //        SLASH
  // =======================
  async executeInteraction(interaction) {
    const guildId = interaction.guildId;
    const action = interaction.options.getString('action');
    const roleOpt = interaction.options.getRole('role');

    // VIEW (SIEMPRE EPHEMERAL)
    if (action === 'view') {
      if (!interaction.memberPermissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({
          embeds: [embedError('Permisos insuficientes', 'Solo administradores pueden ver la configuración.')],
          ephemeral: true
        });
      }

      const settings = await dbhelper.getSettings(guildId);
      const roleId = settings?.managerRole || null;
      const role = roleId ? interaction.guild.roles.cache.get(roleId) : null;

      return interaction.reply({
        embeds: [embedOk('Configuración actual', `Rol gestor: ${role ? role : '`No configurado`'}`)],
        ephemeral: true
      });
    }

    // SET / RESET requieren admin
    if (!interaction.memberPermissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({
        embeds: [embedError('Permisos insuficientes', 'Solo administradores pueden usar esta acción.')],
        ephemeral: true
      });
    }

    // RESET
    if (action === 'reset') {
      await dbhelper.resetManagerRole(guildId);
      return interaction.reply({
        embeds: [embedOk('Rol gestor eliminado', 'Ahora solo administradores pueden usar los comandos.')],
        ephemeral: true
      });
    }

    // SET
    if (action === 'set') {
      if (!roleOpt) {
        return interaction.reply({
          embeds: [embedError('Rol requerido', 'Debes seleccionar un rol.')],
          ephemeral: true
        });
      }

      await dbhelper.setManagerRole(guildId, roleOpt.id);

      return interaction.reply({
        embeds: [embedOk('Rol configurado', `Nuevo rol gestor: ${roleOpt}`)],
        ephemeral: true
      });
    }
  }
};
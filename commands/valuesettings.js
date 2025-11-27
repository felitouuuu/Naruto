// commands/valuesettings.js
const { EmbedBuilder, SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const db = require('../dbhelper.js');

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
  ejemplo: 'valuesettings set @RolGestor\nvaluesettings reset\nvaluesettings view',
  syntax: '<prefix> valuesettings <set/reset/view> [@rol]',

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
        .setDescription('Rol permitido para gestionar alerts.')
        .setRequired(false)
    ),

  // Prefijo
  async executeMessage(msg, args) {
    const guildId = msg.guild.id;
    const sub = (args[0] || '').toLowerCase();

    // VIEW o sin sub
    if (!sub || sub === 'view') {
      const settings = await dbhelper.getSettings(guildId);
      const roleId = settings?.managerRole || null;
      if (!roleId) {
        return msg.channel.send({ embeds: [embedOk('Configuración actual', 'No hay rol gestor configurado. Solo Administradores pueden usar los comandos.')] });
      }
      const role = msg.guild.roles.cache.get(roleId);
      return msg.channel.send({ embeds: [embedOk('Configuración actual', `Rol gestor: ${role ? role : `ID: ${roleId}`}`)] });
    }

    // Requiere admin para set/reset
    if (!msg.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return msg.channel.send({ embeds: [embedError('Permisos insuficientes', 'Solo Administradores pueden usar esta acción.')] });
    }

    if (sub === 'reset') {
      await dbhelper.resetManagerRole(guildId);
      return msg.channel.send({ embeds: [embedOk('Rol gestor eliminado', 'Ahora solo Administradores pueden usar los comandos.')] });
    }

    // SET
    let roleArg = args.slice(1).join(' ').trim();
    const mention = msg.mentions.roles.first();
    const roleIdMatch = roleArg.match(/<@&(\d+)>/) || roleArg.match(/(\d{17,19})/);
    const roleId = mention?.id || (roleIdMatch ? roleIdMatch[1] : null);
    const role = roleId ? msg.guild.roles.cache.get(roleId) : null;

    if (!role) {
      return msg.channel.send({ embeds: [embedError('Rol inválido', 'Menciona un rol válido. Ejemplo: `valuesettings set @Rol`')] });
    }

    await dbhelper.setManagerRole(guildId, role.id);
    return msg.channel.send({ embeds: [embedOk('Rol configurado', `El rol ${role} podrá usar los comandos de configuracion de alerts.`)] });
  },

  // Slash
  async executeInteraction(interaction) {
    const guildId = interaction.guildId;
    const action = interaction.options.getString('action');
    const roleOpt = interaction.options.getRole('role');

    if (action === 'view') {
      const settings = await dbhelper.getSettings(guildId);
      const roleId = settings?.managerRole || null;
      if (!roleId) {
        return interaction.reply({ embeds: [embedOk('Configuración actual', 'No hay rol gestor configurado. Solo Administradores pueden usar los comandos.')], ephemeral: false });
      }
      const role = interaction.guild.roles.cache.get(roleId);
      return interaction.reply({ embeds: [embedOk('Configuración actual', `Rol gestor: ${role ? role : `ID: ${roleId}`}`)], ephemeral: false });
    }

    // set & reset require admin
    if (!interaction.memberPermissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ embeds: [embedError('Permisos insuficientes', 'Solo Administradores pueden usar esta acción.')], ephemeral: false });
    }

    if (action === 'reset') {
      await dbhelper.resetManagerRole(guildId);
      return interaction.reply({ embeds: [embedOk('Rol gestor eliminado', 'Ahora solo los Administradores podrán usar los comandos de alertas.')], ephemeral: false });
    }

    if (action === 'set') {
      if (!roleOpt) return interaction.reply({ embeds: [embedError('Rol faltante', 'Debes seleccionar un rol.')], ephemeral: false });
      await dbhelper.setManagerRole(guildId, roleOpt.id);
      return interaction.reply({ embeds: [embedOk('Rol gestor configurado', `El rol ${roleOpt} podrá usar los comandos de configuracion de alerts.`)], ephemeral: false });
    }

    return interaction.reply({ embeds: [embedError('Error', 'Acción desconocida.')], ephemeral: false });
  }
};
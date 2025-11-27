// commands/valuesettings.js
const { EmbedBuilder, SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'database', 'value.json');

function ensureDb() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify({}, null, 2), 'utf8');
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}
function saveDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
}
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
  ejemplo: 'valuesettings set @RolGestor | valuesettings reset | valuesettings view',
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
        .setDescription('Rol permitido para gestionar alerts (solo para set).')
        .setRequired(false)
    ),

  // Prefijo: mantiene comportamiento previo (mensajes en canal)
  async executeMessage(msg, args) {
    const db = ensureDb();
    const guildId = msg.guild.id;
    const sub = (args[0] || '').toLowerCase();

    // VIEW o sin sub
    if (!sub || sub === 'view') {
      const settings = db[guildId] && db[guildId]._settings;
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

    // RESET
    if (sub === 'reset') {
      if (!db[guildId]) db[guildId] = {};
      if (db[guildId]._settings?.managerRole) {
        delete db[guildId]._settings.managerRole;
        if (Object.keys(db[guildId]._settings).length === 0) delete db[guildId]._settings;
        saveDb(db);
        return msg.channel.send({ embeds: [embedOk('Rol gestor eliminado', 'Ahora solo Administradores pueden usar los comandos.')] });
      } else {
        return msg.channel.send({ embeds: [embedOk('Sin rol gestor', 'No había un rol gestor configurado.')] });
      }
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

    if (!db[guildId]) db[guildId] = {};
    if (!db[guildId]._settings) db[guildId]._settings = {};
    db[guildId]._settings.managerRole = role.id;
    saveDb(db);

    return msg.channel.send({ embeds: [embedOk('Rol configurado', `El rol ${role} podrá usar \`valueset\`, \`valuestop\` y \`listvalue\`.`)] });
  },

  // Slash: ahora RESPONDE con embeds públicos (no ephemeral) para que cualquiera vea la configuración
  async executeInteraction(interaction) {
    const db = ensureDb();
    const guildId = interaction.guildId;
    const action = interaction.options.getString('action');
    const roleOpt = interaction.options.getRole('role');

    // VIEW -> público
    if (action === 'view') {
      const settings = db[guildId] && db[guildId]._settings;
      const roleId = settings?.managerRole || null;
      if (!roleId) {
        return interaction.reply({ embeds: [embedOk('Configuración actual', 'No hay rol gestor configurado. Solo Administradores pueden usar los comandos.')], ephemeral: false });
      }
      const role = interaction.guild.roles.cache.get(roleId);
      return interaction.reply({ embeds: [embedOk('Configuración actual', `Rol gestor: ${role ? role : `ID: ${roleId}`}`)], ephemeral: false });
    }

    // set & reset require admin -> respuesta pública también
    const isAdmin = interaction.memberPermissions && interaction.memberPermissions.has && interaction.memberPermissions.has(PermissionsBitField.Flags.Administrator);
    if (!isAdmin) {
      return interaction.reply({ embeds: [embedError('Permisos insuficientes', 'Necesitas permisos de **Administrador** para usar esta acción.')], ephemeral: false });
    }

    if (action === 'reset') {
      if (!db[guildId]) db[guildId] = {};
      if (db[guildId]._settings && db[guildId]._settings.managerRole) {
        delete db[guildId]._settings.managerRole;
        if (Object.keys(db[guildId]._settings).length === 0) delete db[guildId]._settings;
        saveDb(db);
        return interaction.reply({ embeds: [embedOk('Rol gestor eliminado', 'Ahora solo los Administradores podrán usar los comandos de alertas.')], ephemeral: false });
      } else {
        return interaction.reply({ embeds: [embedOk('Sin rol gestor', 'No había un rol gestor configurado.')], ephemeral: false });
      }
    }

    if (action === 'set') {
      if (!roleOpt) return interaction.reply({ embeds: [embedError('Rol faltante', 'Debes seleccionar un rol.')], ephemeral: false });
      if (!db[guildId]) db[guildId] = {};
      if (!db[guildId]._settings) db[guildId]._settings = {};
      db[guildId]._settings.managerRole = roleOpt.id;
      saveDb(db);
      return interaction.reply({ embeds: [embedOk('Rol gestor configurado', `El rol ${roleOpt} podrá usar \`valueset\`, \`valuestop\` y \`listvalue\`.`)], ephemeral: false });
    }

    // Fallback (no debería llegar)
    return interaction.reply({ embeds: [embedError('Error', 'Acción desconocida.')], ephemeral: false });
  }
};
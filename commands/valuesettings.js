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

/**
 * Helpers para crear embeds cortos
 */
function embedError(title, desc) {
  return new EmbedBuilder().setTitle(title).setDescription(desc).setColor('#ED4245');
}
function embedOk(title, desc) {
  return new EmbedBuilder().setTitle(title).setDescription(desc).setColor('#6A0DAD');
}

module.exports = {
  name: 'valuesettings',
  description: 'Configura el rol gestor que puede usar los comandos de alertas (valueset/valuestop).',
  category: 'Criptos',
  ejemplo: 'valuesettings set @RolGestor | valuesettings reset | valuesettings view',
  syntax: '<prefix_actual> valuesettings set|reset|view [@rol]',

  data: new SlashCommandBuilder()
    .setName('valuesettings')
    .setDescription('Gestionar el rol gestor para alertas')
    .addSubcommand(s =>
      s.setName('set')
       .setDescription('Asignar un rol gestor')
       .addRoleOption(opt => opt.setName('rol').setDescription('Rol que podrá gestionar alerts').setRequired(true))
    )
    .addSubcommand(s =>
      s.setName('reset')
       .setDescription('Quitar rol gestor (restablecer a solo administradores)')
    )
    .addSubcommand(s =>
      s.setName('view')
       .setDescription('Ver el rol gestor actual (si existe)')
    ),

  // Prefijo: soporta:
  // valuesettings set @rol
  // valuesettings reset
  // valuesettings view
  async executeMessage(msg, args) {
    // Requiere administrador para cambiar settings
    if (!msg.member || !msg.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return msg.channel.send({ embeds: [embedError('Permisos insuficientes', 'Necesitas permisos de **Administrador** para usar este comando.')] });
    }

    const db = ensureDb();
    const guildId = msg.guild.id;

    const sub = (args[0] || '').toLowerCase();

    // Si no se pasa subcomando, asumir 'view' cuando solo llaman valuesettings
    if (!sub || sub === 'view') {
      const settings = db[guildId] && db[guildId]._settings;
      const roleId = settings && settings.managerRole ? settings.managerRole : null;
      if (!roleId) {
        return msg.channel.send({ embeds: [embedOk('Configuración actual', 'No hay rol gestor configurado. Solo Administradores pueden usar los comandos.')] });
      }
      const role = msg.guild.roles.cache.get(roleId);
      return msg.channel.send({ embeds: [embedOk('Configuración actual', `Rol gestor: ${role ? role : `ID: ${roleId}`}`)] });
    }

    // RESET
    if (sub === 'reset') {
      if (!db[guildId]) db[guildId] = {};
      if (db[guildId]._settings && db[guildId]._settings.managerRole) {
        delete db[guildId]._settings.managerRole;
        // si _settings quedó vacío, borrarlo
        if (Object.keys(db[guildId]._settings).length === 0) delete db[guildId]._settings;
        saveDb(db);
        return msg.channel.send({ embeds: [embedOk('Rol gestor eliminado', 'Ahora solo los Administradores podrán usar los comandos de alertas.')] });
      } else {
        return msg.channel.send({ embeds: [embedOk('Sin rol gestor', 'No había un rol gestor configurado.')] });
      }
    }

    // SET: esperar mención de rol o ID
    // args puede ser: ['set', '<@&ID>'] o ['<@&ID>'] si no puso sub
    let roleArg = '';
    if (sub === 'set') {
      roleArg = args.slice(1).join(' ').trim();
    } else {
      // si no usó subcomando 'set', permitir usage: valuesettings @rol
      roleArg = args.join(' ').trim();
    }

    const mention = msg.mentions.roles.first();
    const roleIdMatch = roleArg.match(/<@&(\d+)>/) || roleArg.match(/(\d{17,19})/);
    const roleId = mention ? mention.id : (roleIdMatch ? roleIdMatch[1] : null);
    const role = roleId ? msg.guild.roles.cache.get(roleId) : null;

    if (!role) {
      return msg.channel.send({ embeds: [embedError('Rol no válido', 'Menciona el rol o pega su ID. Ej: `!valuesettings set @RolGestor`')] });
    }

    if (!db[guildId]) db[guildId] = {};
    if (!db[guildId]._settings) db[guildId]._settings = {};
    db[guildId]._settings.managerRole = role.id;
    saveDb(db);

    return msg.channel.send({ embeds: [embedOk('Rol gestor configurado', `El rol ${role} podrá usar \`valueset\`, \`valuestop\` y \`listvalue\`.`)] });
  },

  // Slash subcommands: set, reset, view
  async executeInteraction(interaction) {
    // Requiere admin para cambiar settings
    const db = ensureDb();
    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();

    if (sub === 'view') {
      const settings = db[guildId] && db[guildId]._settings;
      const roleId = settings && settings.managerRole ? settings.managerRole : null;
      if (!roleId) {
        return interaction.reply({ embeds: [embedOk('Configuración actual', 'No hay rol gestor configurado. Solo Administradores pueden usar los comandos.')], ephemeral: true });
      }
      const role = interaction.guild.roles.cache.get(roleId);
      return interaction.reply({ embeds: [embedOk('Configuración actual', `Rol gestor: ${role ? role : `ID: ${roleId}`}`)], ephemeral: true });
    }

    // Para set y reset: requiere administrador
    if (!interaction.memberPermissions || !interaction.memberPermissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ embeds: [embedError('Permisos insuficientes', 'Necesitas permisos de **Administrador** para usar esta acción.')], ephemeral: true });
    }

    if (sub === 'reset') {
      if (!db[guildId]) db[guildId] = {};
      if (db[guildId]._settings && db[guildId]._settings.managerRole) {
        delete db[guildId]._settings.managerRole;
        if (Object.keys(db[guildId]._settings).length === 0) delete db[guildId]._settings;
        saveDb(db);
        return interaction.reply({ embeds: [embedOk('Rol gestor eliminado', 'Ahora solo los Administradores podrán usar los comandos de alertas.')], ephemeral: true });
      } else {
        return interaction.reply({ embeds: [embedOk('Sin rol gestor', 'No había un rol gestor configurado.')], ephemeral: true });
      }
    }

    if (sub === 'set') {
      const role = interaction.options.getRole('rol');
      if (!role) {
        return interaction.reply({ embeds: [embedError('Rol no válido', 'Selecciona un rol válido.')], ephemeral: true });
      }
      if (!db[guildId]) db[guildId] = {};
      if (!db[guildId]._settings) db[guildId]._settings = {};
      db[guildId]._settings.managerRole = role.id;
      saveDb(db);
      return interaction.reply({ embeds: [embedOk('Rol gestor configurado', `El rol ${role} podrá usar \`valueset\`, \`valuestop\` y \`listvalue\`.`)], ephemeral: true });
    }

    // Fallback (no debería llegar)
    return interaction.reply({ embeds: [embedError('Error', 'Acción desconocida.')], ephemeral: true });
  }
};
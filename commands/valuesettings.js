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
  syntax: '<prefix_actual> valuesettings <action> [@rol]',

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
    .addRoleOption(opt => opt.setName('role').setDescription('Rol que podrá gestionar alerts (solo para set).').setRequired(false)),

  // Prefijo (mensaje): usage: valuesettings set @rol | valuesettings reset | valuesettings view
  async executeMessage(msg, args) {
    const db = ensureDb();
    const guildId = msg.guild.id;

    const sub = (args[0] || '').toLowerCase();

    // Si no se pasa subcomando, mostrar ayuda (igual que view)
    if (!sub || sub === 'view') {
      const settings = db[guildId] && db[guildId]._settings;
      const roleId = settings && settings.managerRole ? settings.managerRole : null;
      if (!roleId) {
        return msg.channel.send({ embeds: [embedOk('Configuración actual', 'No hay rol gestor configurado. Solo Administradores pueden usar los comandos.')] });
      }
      const role = msg.guild.roles.cache.get(roleId);
      return msg.channel.send({ embeds: [embedOk('Configuración actual', `Rol gestor: ${role ? role : `ID: ${roleId}`}`)] });
    }

    // Para set/reset se requiere Admin
    if (!msg.member || !msg.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return msg.channel.send({ embeds: [embedError('Permisos insuficientes', 'Necesitas permisos de **Administrador** para usar esta acción.')] });
    }

    // RESET
    if (sub === 'reset') {
      if (!db[guildId]) db[guildId] = {};
      if (db[guildId]._settings && db[guildId]._settings.managerRole) {
        delete db[guildId]._settings.managerRole;
        if (Object.keys(db[guildId]._settings).length === 0) delete db[guildId]._settings;
        saveDb(db);
        return msg.channel.send({ embeds: [embedOk('Rol gestor eliminado', 'Ahora solo los Administradores podrán usar los comandos de alertas.')] });
      } else {
        return msg.channel.send({ embeds: [embedOk('Sin rol gestor', 'No había un rol gestor configurado.')] });
      }
    }

    // SET: permitir usage "valuesettings set @rol" o "valuesettings @rol"
    let roleArg = args.slice(1).join(' ').trim();
    if (!roleArg) roleArg = args.slice(0).join(' ').trim(); // caso: valuesettings @rol

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

  // Slash: /valuesettings action:<set|reset|view> role:<rol opcional>
  async executeInteraction(interaction) {
    const db = ensureDb();
    const guildId = interaction.guildId;
    const action = interaction.options.getString('action');
    const roleOpt = interaction.options.getRole('role');

    if (action === 'view') {
      const settings = db[guildId] && db[guildId]._settings;
      const roleId = settings && settings.managerRole ? settings.managerRole : null;
      if (!roleId) {
        return interaction.reply({ embeds: [embedOk('Configuración actual', 'No hay rol gestor configurado. Solo Administradores pueden usar los comandos.')], ephemeral: true });
      }
      const role = interaction.guild.roles.cache.get(roleId);
      return interaction.reply({ embeds: [embedOk('Configuración actual', `Rol gestor: ${role ? role : `ID: ${roleId}`}`)], ephemeral: true });
    }

    // set & reset require admin
    if (!interaction.memberPermissions || !interaction.memberPermissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ embeds: [embedError('Permisos insuficientes', 'Necesitas permisos de **Administrador** para usar esta acción.')], ephemeral: true });
    }

    if (action === 'reset') {
      if (!db[guildId]) db[guildId] = {};
      if (db[guildId]._settings && db[guildId]._settings.managerRole) {
        delete db[guildId]._settings.managerRole;
        if (Object.keys(db[guildId]._settings).length === 0) delete db[guildId]._settings;
        saveDb(db);
        return interaction.reply({ embeds: [embedOk('Rol gestor eliminado', 'Ahora solo los Administradores podrán usar los comandos de alertas
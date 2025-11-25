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

module.exports = {
  name: 'valuesettings',
  description: 'Configura el rol gestor que puede usar los comandos de alertas (valueset/valuestop).',
  category: 'Criptos',
  ejemplo: 'valuesettings @RolGestor',
  syntax: '<prefix_actual> valuesettings <@rol>',

  data: new SlashCommandBuilder()
    .setName('valuesettings')
    .setDescription('Configura el rol gestor para alertas')
    .addRoleOption(opt => opt.setName('rol').setDescription('Rol que podrá gestionar alerts').setRequired(true)),

  // Prefijo
  async executeMessage(msg, args) {
    // Requiere administrador para establecer el rol
    if (!msg.member || !msg.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      const e = new EmbedBuilder().setTitle('Permisos insuficientes').setColor('#ED4245')
        .setDescription('Necesitas permisos de **Administrador** para configurar el rol gestor.');
      return msg.channel.send({ embeds: [e] });
    }

    const roleArg = args.slice(0).join(' ').trim();
    const mention = msg.mentions.roles.first();
    const roleIdMatch = roleArg.match(/<@&(\d+)>/) || roleArg.match(/(\d{17,19})/);
    const roleId = mention ? mention.id : (roleIdMatch ? roleIdMatch[1] : null);
    const role = roleId ? msg.guild.roles.cache.get(roleId) : null;

    if (!role) {
      const e = new EmbedBuilder().setTitle('Rol no válido').setColor('#ED4245')
        .setDescription('Menciona el rol o pega su ID. Ej: `!valuesettings @RolGestor`');
      return msg.channel.send({ embeds: [e] });
    }

    const db = ensureDb();
    if (!db[msg.guild.id]) db[msg.guild.id] = {};
    if (!db[msg.guild.id]._settings) db[msg.guild.id]._settings = {};
    db[msg.guild.id]._settings.managerRole = role.id;
    saveDb(db);

    const embed = new EmbedBuilder().setTitle('Rol gestor configurado').setColor('#6A0DAD')
      .setDescription(`El rol ${role} podrá ahora usar \`valueset\`, \`valuestop\` y \`listvalue\`.`);
    return msg.channel.send({ embeds: [embed] });
  },

  // Slash
  async executeInteraction(interaction) {
    // requiere admin
    if (!interaction.memberPermissions || !interaction.memberPermissions.has(PermissionsBitField.Flags.Administrator)) {
      const e = new EmbedBuilder().setTitle('Permisos insuficientes').setColor('#ED4245')
        .setDescription('Necesitas permisos de **Administrador** para configurar el rol gestor.');
      return interaction.reply({ embeds: [e], ephemeral: true });
    }

    const role = interaction.options.getRole('rol');
    if (!role) {
      const e = new EmbedBuilder().setTitle('Rol no válido').setColor('#ED4245')
        .setDescription('Selecciona un rol válido.');
      return interaction.reply({ embeds: [e], ephemeral: true });
    }

    const db = ensureDb();
    if (!db[interaction.guildId]) db[interaction.guildId] = {};
    if (!db[interaction.guildId]._settings) db[interaction.guildId]._settings = {};
    db[interaction.guildId]._settings.managerRole = role.id;
    saveDb(db);

    const embed = new EmbedBuilder().setTitle('Rol gestor configurado').setColor('#6A0DAD')
      .setDescription(`El rol ${role} podrá ahora usar \`valueset\`, \`valuestop\` y \`listvalue\`.`);
    return interaction.reply({ embeds: [embed] });
  }
};
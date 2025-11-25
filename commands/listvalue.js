// commands/listvalue.js
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

/**
 * memberCanManage(member, db, guildId)
 * - true if member is Administrator OR has the configured managerRole for the guild
 */
function memberCanManage(member, db, guildId) {
  try {
    if (!member) return false;
    if (member.permissions && member.permissions.has && member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
    const settings = db[guildId] && db[guildId]._settings;
    if (settings && settings.managerRole && member.roles && member.roles.cache) {
      return member.roles.cache.has(settings.managerRole);
    }
  } catch (err) {
    // ignore and return false
  }
  return false;
}

module.exports = {
  name: 'listvalue',
  description: 'Muestra todas las alertas/valores configurados en este servidor.',
  category: 'Criptos',
  ejemplo: 'listvalue',
  syntax: '!listvalue',

  data: new SlashCommandBuilder()
    .setName('listvalue')
    .setDescription('Muestra las alertas/valores configurados en este servidor'),

  // Prefix (!listvalue)
  async executeMessage(msg) {
    const db = ensureDb();
    const guildId = msg.guild.id;

    // permisos: admin o rol gestor
    if (!memberCanManage(msg.member, db, guildId)) {
      const e = new EmbedBuilder()
        .setTitle('Permisos insuficientes')
        .setColor('#ED4245')
        .setDescription('Necesitas ser Administrador o tener el rol gestor configurado para ver las configuraciones.');
      return msg.channel.send({ embeds: [e] });
    }

    const server = db[guildId];
    if (!server) {
      const embed = new EmbedBuilder()
        .setTitle('📭 Sin configuraciones activas')
        .setDescription('No hay alertas configuradas en este servidor.')
        .setColor('#6A0DAD');
      return msg.channel.send({ embeds: [embed] });
    }

    const settings = server._settings || {};
    const managerRoleId = settings.managerRole || null;

    // build list excluding _settings
    const keys = Object.keys(server).filter(k => k !== '_settings');
    if (keys.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle('📭 Sin configuraciones activas')
        .setDescription('No hay alertas configuradas en este servidor.')
        .setColor('#6A0DAD');

      if (managerRoleId) embed.addFields({ name: 'Rol gestor', value: `<@&${managerRoleId}>`, inline: false });

      return msg.channel.send({ embeds: [embed] });
    }

    let list = '';
    for (const coin of keys) {
      const cfg = server[coin] || {};
      // Support older schemas: interval OR target
      const when = cfg.interval ? `cada ${cfg.interval}m` : (cfg.target ? `objetivo $${cfg.target}` : 'sin datos');
      const chan = cfg.channel ? `<#${cfg.channel}>` : 'No definido';
      list += `**${coin.toUpperCase()}** — ${when} — ${chan}\n`;
    }

    const embed = new EmbedBuilder()
      .setTitle('📋 Configuraciones de Alertas Activas')
      .setDescription(list)
      .setColor('#6A0DAD');

    if (managerRoleId) {
      embed.addFields({ name: 'Rol gestor', value: `<@&${managerRoleId}>`, inline: false });
    }

    return msg.channel.send({ embeds: [embed] });
  },

  // Slash (/listvalue)
  async executeInteraction(interaction) {
    const db = ensureDb();
    const guildId = interaction.guildId;

    // permisos: admin o rol gestor
    const member = interaction.member;
    if (!memberCanManage(member, db, guildId)) {
      const e = new EmbedBuilder()
        .setTitle('Permisos insuficientes')
        .setColor('#ED4245')
        .setDescription('Necesitas ser Administrador o tener el rol gestor configurado para ver las configuraciones.');
      return interaction.reply({ embeds: [e], ephemeral: true });
    }

    const server = db[guildId];
    if (!server) {
      const embed = new EmbedBuilder()
        .setTitle('📭 Sin configuraciones activas')
        .setDescription('No hay alertas configuradas en este servidor.')
        .setColor('#6A0DAD');
      return interaction.reply({ embeds: [embed] });
    }

    const settings = server._settings || {};
    const managerRoleId = settings.managerRole || null;

    const keys = Object.keys(server).filter(k => k !== '_settings');
    if (keys.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle('📭 Sin configuraciones activas')
        .setDescription('No hay alertas configuradas en este servidor.')
        .setColor('#6A0DAD');

      if (managerRoleId) embed.addFields({ name: 'Rol gestor', value: `<@&${managerRoleId}>`, inline: false });

      return interaction.reply({ embeds: [embed] });
    }

    let list = '';
    for (const coin of keys) {
      const cfg = server[coin] || {};
      const when = cfg.interval ? `cada ${cfg.interval}m` : (cfg.target ? `objetivo $${cfg.target}` : 'sin datos');
      const chan = cfg.channel ? `<#${cfg.channel}>` : 'No definido';
      list += `**${coin.toUpperCase()}** — ${when} — ${chan}\n`;
    }

    const embed = new EmbedBuilder()
      .setTitle('📋 Configuraciones de Alertas Activas')
      .setDescription(list)
      .setColor('#6A0DAD');

    if (managerRoleId) {
      embed.addFields({ name: 'Rol gestor', value: `<@&${managerRoleId}>`, inline: false });
    }

    return interaction.reply({ embeds: [embed] });
  }
};
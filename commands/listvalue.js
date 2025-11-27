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
function memberCanManage(member, db, guildId) {
  try {
    if (!member) return false;
    if (member.permissions && member.permissions.has && member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
    const settings = db[guildId] && db[guildId]._settings;
    if (settings && settings.managerRole && member.roles && member.roles.cache) {
      return member.roles.cache.has(settings.managerRole);
    }
  } catch {}
  return false;
}

module.exports = {
  name: 'listvalue',
  description: 'Muestra las publicaciones periódicas configuradas en este servidor.',
  category: 'Criptos',
  ejemplo: 'listvalue',
  syntax: '!listvalue',

  data: new SlashCommandBuilder()
    .setName('listvalue')
    .setDescription('Muestra las publicaciones periódicas configuradas en este servidor'),

  // Prefix
  async executeMessage(msg) {
    const db = ensureDb();
    const guildId = msg.guild.id;

    if (!memberCanManage(msg.member, db, guildId)) {
      const e = new EmbedBuilder().setTitle('Permisos insuficientes').setColor('#ED4245')
        .setDescription('Necesitas ser Administrador o tener el rol gestor configurado para ver las configuraciones.');
      return msg.channel.send({ embeds: [e] });
    }

    const server = db[guildId];
    if (!server || !server.periodic || Object.keys(server.periodic).length === 0) {
      const embed = new EmbedBuilder().setTitle('📭 Sin publicaciones activas').setDescription('No hay publicaciones periódicas en este servidor.').setColor('#6A0DAD');
      if (server && server._settings && server._settings.managerRole) embed.addFields({ name: 'Rol gestor', value: `<@&${server._settings.managerRole}>`, inline: false });
      return msg.channel.send({ embeds: [embed] });
    }

    let list = '';
    for (const coin of Object.keys(server.periodic)) {
      const cfg = server.periodic[coin];
      const last = cfg.lastSent ? `<t:${Math.floor(cfg.lastSent)}:R>` : 'Nunca';
      list += `**${coin.toUpperCase()}** — cada **${cfg.interval}m** — ${cfg.channel ? `<#${cfg.channel}>` : 'No definido'} — Última: ${last}\n`;
    }

    const embed = new EmbedBuilder().setTitle('📋 Publicaciones periódicas activas').setDescription(list).setColor('#6A0DAD');
    if (server._settings && server._settings.managerRole) embed.addFields({ name: 'Rol gestor', value: `<@&${server._settings.managerRole}>`, inline: false });

    return msg.channel.send({ embeds: [embed] });
  },

  // Slash
  async executeInteraction(interaction) {
    const db = ensureDb();
    const guildId = interaction.guildId;
    const member = interaction.member;

    if (!memberCanManage(member, db, guildId)) {
      const e = new EmbedBuilder().setTitle('Permisos insuficientes').setColor('#ED4245')
        .setDescription('Necesitas ser Administrador o tener el rol gestor configurado para ver las configuraciones.');
      return interaction.reply({ embeds: [e], ephemeral: true });
    }

    const server = db[guildId];
    if (!server || !server.periodic || Object.keys(server.periodic).length === 0) {
      const embed = new EmbedBuilder().setTitle('📭 Sin publicaciones activas').setDescription('No hay publicaciones periódicas en este servidor.').setColor('#6A0DAD');
      if (server && server._settings && server._settings.managerRole) embed.addFields({ name: 'Rol gestor', value: `<@&${server._settings.managerRole}>`, inline: false });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    let list = '';
    for (const coin of Object.keys(server.periodic)) {
      const cfg = server.periodic[coin];
      const last = cfg.lastSent ? `<t:${Math.floor(cfg.lastSent)}:R>` : 'Nunca';
      list += `**${coin.toUpperCase()}** — cada **${cfg.interval}m** — ${cfg.channel ? `<#${cfg.channel}>` : 'No definido'} — Última: ${last}\n`;
    }

    const embed = new EmbedBuilder().setTitle('📋 Publicaciones periódicas activas').setDescription(list).setColor('#6A0DAD');
    if (server._settings && server._settings.managerRole) embed.addFields({ name: 'Rol gestor', value: `<@&${server._settings.managerRole}>`, inline: false });

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
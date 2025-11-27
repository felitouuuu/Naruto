// commands/listvalue.js
const { EmbedBuilder, SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const db = require('../dbhelper.js');

async function memberCanManage(member, guildId) {
  if (!member) return false;
  try {
    if (member.permissions && member.permissions.has && member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
    const settings = await dbhelper.getSettings(guildId);
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

  async executeMessage(msg) {
    const guildId = msg.guild.id;

    if (!await memberCanManage(msg.member, guildId)) {
      const e = new EmbedBuilder().setTitle('Permisos insuficientes').setColor('#ED4245')
        .setDescription('Necesitas ser Administrador o tener el rol gestor configurado para ver las configuraciones.');
      return msg.channel.send({ embeds: [e] });
    }

    const rows = await dbhelper.listPeriodic(guildId);
    if (!rows || rows.length === 0) {
      const embed = new EmbedBuilder().setTitle('📭 Sin publicaciones activas').setDescription('No hay publicaciones periódicas en este servidor.').setColor('#6A0DAD');
      const settings = await dbhelper.getSettings(guildId);
      if (settings && settings.managerRole) embed.addFields({ name: 'Rol gestor', value: `<@&${settings.managerRole}>`, inline: false });
      return msg.channel.send({ embeds: [embed] });
    }

    let list = '';
    for (const r of rows) {
      const last = r.last_sent_epoch ? `<t:${Math.floor(r.last_sent_epoch)}:R>` : 'Nunca';
      list += `**${r.coin.toUpperCase()}** — cada **${r.interval_minutes}m** — ${r.channel_id ? `<#${r.channel_id}>` : 'No definido'} — Última: ${last}\n`;
    }

    const settings = await dbhelper.getSettings(guildId);
    const embed = new EmbedBuilder().setTitle('📋 Publicaciones periódicas activas').setDescription(list).setColor('#6A0DAD');
    if (settings && settings.managerRole) embed.addFields({ name: 'Rol gestor', value: `<@&${settings.managerRole}>`, inline: false });

    return msg.channel.send({ embeds: [embed] });
  },

  async executeInteraction(interaction) {
    const guildId = interaction.guildId;
    const member = interaction.member;

    if (!await memberCanManage(member, guildId)) {
      const e = new EmbedBuilder().setTitle('Permisos insuficientes').setColor('#ED4245')
        .setDescription('Necesitas ser Administrador o tener el rol gestor configurado para ver las configuraciones.');
      return interaction.reply({ embeds: [e], ephemeral: true });
    }

    const rows = await dbhelper.listPeriodic(guildId);
    if (!rows || rows.length === 0) {
      const embed = new EmbedBuilder().setTitle('📭 Sin publicaciones activas').setDescription('No hay publicaciones periódicas en este servidor.').setColor('#6A0DAD');
      const settings = await dbhelper.getSettings(guildId);
      if (settings && settings.managerRole) embed.addFields({ name: 'Rol gestor', value: `<@&${settings.managerRole}>`, inline: false });
      return interaction.reply({ embeds: [embed], ephemeral: false });
    }

    let list = '';
    for (const r of rows) {
      const last = r.last_sent_epoch ? `<t:${Math.floor(r.last_sent_epoch)}:R>` : 'Nunca';
      list += `**${r.coin.toUpperCase()}** — cada **${r.interval_minutes}m** — ${r.channel_id ? `<#${r.channel_id}>` : 'No definido'} — Última: ${last}\n`;
    }

    const settings = await dbhelper.getSettings(guildId);
    const embed = new EmbedBuilder().setTitle('📋 Publicaciones periódicas activas').setDescription(list).setColor('#6A0DAD');
    if (settings && settings.managerRole) embed.addFields({ name: 'Rol gestor', value: `<@&${settings.managerRole}>`, inline: false });

    return interaction.reply({ embeds: [embed], ephemeral: false });
  }
};
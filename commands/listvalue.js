// commands/listvalue.js
const { EmbedBuilder, SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const dbhelper = require('../dbhelper.js');

async function memberCanManage(member, guildId) {
  if (!member) return false;
  try {
    if (member.permissions?.has(PermissionsBitField.Flags.Administrator)) return true;
    const settings = await dbhelper.getSettings(guildId);
    if (settings?.managerRole && member.roles?.cache) {
      return member.roles.cache.has(settings.managerRole);
    }
  } catch (err) {
    console.error("❌ Error en memberCanManage:", err);
  }
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
    try {
      console.log("🔍 Ejecutando !listvalue en guild:", msg.guild?.id);

      const guildId = msg.guild?.id;
      if (!guildId) throw new Error("GuildId no disponible");

      console.log("👤 Verificando permisos...");
      if (!await memberCanManage(msg.member, guildId)) {
        console.log("⚠️ Permisos insuficientes");
        const e = new EmbedBuilder().setTitle('Permisos insuficientes').setColor('#ED4245')
          .setDescription('Necesitas ser Administrador o tener el rol gestor configurado.');
        return msg.channel.send({ embeds: [e] });
      }

      console.log("📦 Consultando publicaciones periódicas...");
      const rows = await dbhelper.listPeriodic(guildId);
      console.log("📊 Resultado de listPeriodic:", rows);

      if (!rows || rows.length === 0) {
        console.log("📭 No hay publicaciones activas");
        const embed = new EmbedBuilder().setTitle('📭 Sin publicaciones activas')
          .setDescription('No hay publicaciones periódicas en este servidor.')
          .setColor('#6A0DAD');
        const settings = await dbhelper.getSettings(guildId);
        if (settings?.managerRole) embed.addFields({ name: 'Rol gestor', value: `<@&${settings.managerRole}>` });
        return msg.channel.send({ embeds: [embed] });
      }

      let list = '';
      for (const r of rows) {
        console.log("➡️ Procesando fila:", r);
        const last = r.last_sent_epoch ? `<t:${Math.floor(r.last_sent_epoch)}:R>` : 'Nunca';
        list += `**${r.coin.toUpperCase()}** — cada **${r.interval_minutes}m** — ${r.channel_id ? `<#${r.channel_id}>` : 'No definido'} — Última: ${last}\n`;
      }

      const settings = await dbhelper.getSettings(guildId);
      const embed = new EmbedBuilder().setTitle('📋 Publicaciones periódicas activas').setDescription(list).setColor('#6A0DAD');
      if (settings?.managerRole) embed.addFields({ name: 'Rol gestor', value: `<@&${settings.managerRole}>` });

      console.log("✅ Enviando embed con publicaciones");
      return msg.channel.send({ embeds: [embed] });

    } catch (error) {
      console.error("❌ Error en executeMessage:", error.stack || error);
      const e = new EmbedBuilder().setTitle('Error interno').setColor('#ED4245')
        .setDescription('Ocurrió un error al ejecutar el comando. Revisa la consola para más detalles.');
      return msg.channel.send({ embeds: [e] });
    }
  },

  async executeInteraction(interaction) {
    try {
      console.log("🔍 Ejecutando /listvalue en guild:", interaction.guildId);

      const guildId = interaction.guildId;
      const member = interaction.member;

      console.log("👤 Verificando permisos...");
      if (!await memberCanManage(member, guildId)) {
        console.log("⚠️ Permisos insuficientes");
        const e = new EmbedBuilder().setTitle('Permisos insuficientes').setColor('#ED4245')
          .setDescription('Necesitas ser Administrador o tener el rol gestor configurado.');
        return interaction.reply({ embeds: [e], ephemeral: true });
      }

      console.log("📦 Consultando publicaciones periódicas...");
      const rows = await dbhelper.listPeriodic(guildId);
      console.log("📊 Resultado de listPeriodic:", rows);

      if (!rows || rows.length === 0) {
        console.log("📭 No hay publicaciones activas");
        const embed = new EmbedBuilder().setTitle('📭 Sin publicaciones activas')
          .setDescription('No hay publicaciones periódicas en este servidor.')
          .setColor('#6A0DAD');
        const settings = await dbhelper.getSettings(guildId);
        if (settings?.managerRole) embed.addFields({ name: 'Rol gestor', value: `<@&${settings.managerRole}>` });
        return interaction.reply({ embeds: [embed], ephemeral: false });
      }

      let list = '';
      for (const r of rows) {
        console.log("➡️ Procesando fila:", r);
        const last = r.last_sent_epoch ? `<t:${Math.floor(r.last_sent_epoch)}:R>` : 'Nunca';
        list += `**${r.coin.toUpperCase()}** — cada **${r.interval_minutes}m** — ${r.channel_id ? `<#${r.channel_id}>` : 'No definido'} — Última: ${last}\n`;
      }

      const settings = await dbhelper.getSettings(guildId);
      const embed = new EmbedBuilder().setTitle('📋 Publicaciones periódicas activas').setDescription(list).setColor('#6A0DAD');
      if (settings?.managerRole) embed.addFields({ name: 'Rol gestor', value: `<@&${settings.managerRole}>` });

      console.log("✅ Enviando embed con publicaciones");
      return interaction.reply({ embeds: [embed], ephemeral: false });

    } catch (error) {
      console.error("❌ Error en executeInteraction:", error.stack || error);
      const e = new EmbedBuilder().setTitle('Error interno').setColor('#ED4245')
        .setDescription('Ocurrió un error al ejecutar el comando. Revisa la consola para más detalles.');
      return interaction.reply({ embeds: [e], ephemeral: true });
    }
  }
};

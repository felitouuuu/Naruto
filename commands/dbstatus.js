// commands/dbstatus.js
const { EmbedBuilder, SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const db = require('../database');

module.exports = {
  name: 'dbstatus',
  description: 'Muestra conteos y primeros registros de las tablas de value (admin only).',
  category: 'Criptos',
  ejemplo: 'dbstatus',

  data: new SlashCommandBuilder()
    .setName('dbstatus')
    .setDescription('Ver estado de la BD (admins)'),

  async executeMessage(msg) {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return msg.channel.send({ embeds: [ new EmbedBuilder().setTitle('Permisos insuficientes').setColor('#ED4245').setDescription('Solo administradores pueden usar este comando.') ]});
    }
    await runReport(msg.channel);
  },

  async executeInteraction(interaction) {
    if (!interaction.memberPermissions || !interaction.memberPermissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ embeds: [ new EmbedBuilder().setTitle('Permisos insuficientes').setColor('#ED4245').setDescription('Solo administradores pueden usar este comando.') ], ephemeral: true });
    }
    await runReport(interaction);
  }
};

async function runReport(target) {
  const embed = new EmbedBuilder().setTitle('DB Status').setColor('#6A0DAD').setTimestamp();

  const tables = ['value_settings','value_periodic','value_alerts','value_logs'];
  try {
    for (const t of tables) {
      const res = await db.query(`SELECT COUNT(*) AS c FROM ${t}`);
      const count = res.rows[0] ? res.rows[0].c : 0;
      embed.addFields({ name: `${t}`, value: `Filas: **${count}**`, inline: false });

      // traer hasta 3 filas para inspección
      const sample = await db.query(`SELECT * FROM ${t} LIMIT 3`);
      if (sample.rows.length) {
        const rowsText = sample.rows.map(r => {
          const keys = Object.keys(r).slice(0,4); // mostrar primeras 4 columnas
          return keys.map(k => `${k}: ${String(r[k])}`).join(' | ');
        }).join('\n');
        embed.addFields({ name: `${t} — ejemplo`, value: '```\n' + rowsText + '\n```', inline: false });
      }
    }

    if (target.reply) {
      // interaction
      await target.reply({ embeds: [embed], ephemeral: false });
    } else {
      await target.send({ embeds: [embed] });
    }
  } catch (err) {
    console.error('dbstatus error', err);
    const errEmb = new EmbedBuilder().setTitle('Error DB').setColor('#ED4245').setDescription(String(err));
    if (target.reply) await target.reply({ embeds: [errEmb], ephemeral: true });
    else await target.channel.send({ embeds: [errEmb] });
  }
}
const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const db = require('../database');

const DEV_OWNER_ID = '1003512479277662208';
const DEV_GUILD_ID = '1390187634093199461';

module.exports = {
  name: 'dbstatus',
  description: 'Muestra el estado de la base de datos y tablas (counts).',
  category: 'Developer',
  ejemplo: 'dbstatus',
  syntax: '<prefix_actual> dbstatus',

  data: new SlashCommandBuilder()
    .setName('dbstatus')
    .setDescription('Estado de la base de datos'),

  // Prefijo
  async executeMessage(msg) {
    // Solo el owner en el servidor especificado puede usarlo; si no, no respondemos
    if (String(msg.guild?.id) !== DEV_GUILD_ID || String(msg.author?.id) !== DEV_OWNER_ID) {
      return; // no respondemos públicamente
    }

    try {
      const res = await db.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;`);
      const tables = res.rows.map(r => r.tablename);

      let desc = '';
      for (const t of tables) {
        try {
          const c = await db.query(`SELECT COUNT(*) AS cnt FROM ${t};`);
          desc += `**${t}** — ${c.rows[0].cnt} registros\n`;
        } catch (err) {
          desc += `**${t}** — no se puede contar (perm/estructura)\n`;
        }
      }

      if (tables.length === 0) desc = 'No se encontraron tablas en la base de datos.';

      const embed = new EmbedBuilder()
        .setTitle('🔎 Estado DB')
        .setDescription(desc)
        .setColor('#6A0DAD')
        .setTimestamp();

      return msg.channel.send({ embeds: [embed] });
    } catch (err) {
      const embed = new EmbedBuilder()
        .setTitle('❌ Error consultando DB')
        .setDescription(String(err.message || err))
        .setColor('#ED4245')
        .setTimestamp();
      return msg.channel.send({ embeds: [embed] });
    }
  },

  // Slash
  async executeInteraction(interaction) {
    // Solo owner en guild puede usarlo; si no, respondemos ephemeral con mensaje mínimo
    if (String(interaction.guildId) !== DEV_GUILD_ID || String(interaction.user.id) !== DEV_OWNER_ID) {
      return interaction.reply({ content: 'Comando no disponible.', ephemeral: true });
    }

    try {
      const res = await db.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;`);
      const tables = res.rows.map(r => r.tablename);

      let desc = '';
      for (const t of tables) {
        try {
          const c = await db.query(`SELECT COUNT(*) AS cnt FROM ${t};`);
          desc += `**${t}** — ${c.rows[0].cnt} registros\n`;
        } catch {
          desc += `**${t}** — no se puede contar (perm/estructura)\n`;
        }
      }

      if (tables.length === 0) desc = 'No se encontraron tablas en la base de datos.';

      const embed = new EmbedBuilder()
        .setTitle('🔎 Estado DB')
        .setDescription(desc)
        .setColor('#6A0DAD')
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: false });
    } catch (err) {
      return interaction.reply({ embeds: [
        new EmbedBuilder().setTitle('❌ Error consultando DB').setDescription(String(err.message || err)).setColor('#ED4245')
      ], ephemeral: false });
    }
  }
};
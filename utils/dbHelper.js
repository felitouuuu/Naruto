// utils/dbHelper.js
const db = require('../database');

module.exports = {
  // PREFIXES
  async getPrefix(guildId) {
    const res = await db.query('SELECT prefix FROM prefixes WHERE guild_id = $1', [guildId]);
    return res.rows[0]?.prefix || null;
  },

  async setPrefix(guildId, prefix) {
    await db.query(`
      INSERT INTO prefixes (guild_id, prefix)
      VALUES ($1, $2)
      ON CONFLICT (guild_id) DO UPDATE SET prefix = EXCLUDED.prefix, updated_at = NOW()
    `, [guildId, prefix]);
    return prefix;
  },

  // VALUE SETTINGS (role/channel)
  async getValueSettings(guildId) {
    const res = await db.query('SELECT * FROM value_settings WHERE guild_id = $1', [guildId]);
    return res.rows[0] || null;
  },

  async setManagerRole(guildId, roleId) {
    await db.query(`
      INSERT INTO value_settings (guild_id, manager_role)
      VALUES ($1, $2)
      ON CONFLICT (guild_id) DO UPDATE SET manager_role = EXCLUDED.manager_role, updated_at = NOW()
    `, [guildId, roleId]);
    return true;
  },

  async removeManagerRole(guildId) {
    await db.query('UPDATE value_settings SET manager_role = NULL, updated_at = NOW() WHERE guild_id = $1', [guildId]);
    return true;
  },

  // PERIODIC (valueset)
  async addOrUpdatePeriodic(guildId, coin, intervalMinutes, channelId) {
    await db.query(`
      INSERT INTO value_periodic (guild_id, coin, interval_minutes, channel_id, last_sent)
      VALUES ($1, $2, $3, $4, NULL)
      ON CONFLICT (guild_id, coin) DO UPDATE
        SET interval_minutes = EXCLUDED.interval_minutes,
            channel_id = EXCLUDED.channel_id,
            enabled = TRUE,
            updated_at = NOW()
    `, [guildId, coin, intervalMinutes, channelId]);
    return true;
  },

  async removePeriodic(guildId, coin) {
    await db.query('DELETE FROM value_periodic WHERE guild_id = $1 AND coin = $2', [guildId, coin]);
    return true;
  },

  async listPeriodics(guildId) {
    const res = await db.query('SELECT coin, interval_minutes, channel_id, last_sent FROM value_periodic WHERE guild_id = $1', [guildId]);
    return res.rows;
  },

  async getAllPeriodics() {
    const res = await db.query('SELECT * FROM value_periodic WHERE enabled = TRUE');
    return res.rows;
  },

  async updatePeriodicLastSent(id, ts) {
    await db.query('UPDATE value_periodic SET last_sent = $1 WHERE id = $2', [ts, id]);
    return true;
  },

  // ALERTS
  async addAlert(guildId, coin, target, channelId, mentionRole = null) {
    const res = await db.query(`
      INSERT INTO value_alerts (guild_id, coin, target, channel_id, mention_role)
      VALUES ($1,$2,$3,$4,$5) RETURNING *
    `, [guildId, coin, target, channelId, mentionRole]);
    return res.rows[0];
  },

  async removeAlertById(id) {
    await db.query('DELETE FROM value_alerts WHERE id = $1', [id]);
    return true;
  },

  async listAlerts(guildId) {
    const res = await db.query('SELECT * FROM value_alerts WHERE guild_id = $1 AND triggered = FALSE', [guildId]);
    return res.rows;
  },

  // DB STATUS
  async dbStatus() {
    const q = `
      SELECT
        (SELECT count(*) FROM value_alerts) AS alerts,
        (SELECT count(*) FROM value_logs) AS logs,
        (SELECT count(*) FROM value_periodic) AS periodics,
        (SELECT count(*) FROM value_settings) AS settings,
        (SELECT count(*) FROM prefixes) AS prefixes
    `;
    const res = await db.query(q);
    return res.rows[0];
  }
};
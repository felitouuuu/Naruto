// dbhelper.js
const pool = require('./database');

/**
 * Prefix helpers
 */
async function getPrefix(guildId) {
  if (!guildId) return null;
  const res = await pool.query('SELECT prefix FROM guild_prefixes WHERE guild_id = $1', [guildId]);
  return res.rowCount ? res.rows[0].prefix : null;
}
async function setPrefix(guildId, prefix) {
  if (!guildId) return;
  await pool.query(
    `INSERT INTO guild_prefixes (guild_id, prefix)
     VALUES ($1, $2)
     ON CONFLICT (guild_id) DO UPDATE SET prefix = EXCLUDED.prefix`,
    [guildId, prefix]
  );
}
async function loadAllPrefixes() {
  const res = await pool.query('SELECT guild_id, prefix FROM guild_prefixes');
  // return object map guildId -> prefix
  const map = {};
  for (const r of res.rows) map[r.guild_id] = r.prefix;
  return map;
}

/**
 * Periodic (value_periodic) helpers
 */
async function setPeriodic(guildId, coin, intervalMinutes, channelId) {
  await pool.query(
    `INSERT INTO value_periodic (guild_id, coin, interval_minutes, channel_id, last_sent, enabled)
     VALUES ($1, $2, $3, $4, NULL, TRUE)
     ON CONFLICT (guild_id, coin) DO UPDATE
     SET interval_minutes = EXCLUDED.interval_minutes,
         channel_id = EXCLUDED.channel_id,
         enabled = TRUE`,
    [guildId, coin, intervalMinutes, channelId]
  );
}
async function deletePeriodic(guildId, coin) {
  await pool.query(
    `DELETE FROM value_periodic WHERE guild_id = $1 AND coin = $2`,
    [guildId, coin]
  );
}
async function getPeriodic(guildId, coin) {
  const res = await pool.query(
    `SELECT id, coin, interval_minutes, channel_id,
            extract(epoch from last_sent) AS last_sent_epoch,
            enabled
     FROM value_periodic WHERE guild_id = $1 AND coin = $2`,
    [guildId, coin]
  );
  return res.rows[0] || null;
}
async function listPeriodic(guildId) {
  const res = await pool.query(
    `SELECT coin, interval_minutes, channel_id,
            extract(epoch from last_sent) AS last_sent_epoch,
            enabled
     FROM value_periodic WHERE guild_id = $1 ORDER BY coin`,
    [guildId]
  );
  return res.rows;
}

/**
 * Settings (value_settings)
 */
async function setManagerRole(guildId, roleId) {
  await pool.query(
    `INSERT INTO value_settings (guild_id, manager_role, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (guild_id) DO UPDATE SET manager_role = EXCLUDED.manager_role, updated_at = NOW()`,
    [guildId, roleId]
  );
}
async function resetManagerRole(guildId) {
  await pool.query(
    `INSERT INTO value_settings (guild_id, manager_role, updated_at)
     VALUES ($1, NULL, NOW())
     ON CONFLICT (guild_id) DO UPDATE SET manager_role = NULL, updated_at = NOW()`,
    [guildId]
  );
}
async function getSettings(guildId) {
  const res = await pool.query('SELECT manager_role FROM value_settings WHERE guild_id = $1', [guildId]);
  if (!res.rowCount) return {};
  return { managerRole: res.rows[0].manager_role || null };
}

module.exports = {
  // prefixes
  getPrefix,
  setPrefix,
  loadAllPrefixes,
  // periodic
  setPeriodic,
  deletePeriodic,
  getPeriodic,
  listPeriodic,
  // settings
  setManagerRole,
  resetManagerRole,
  getSettings
};
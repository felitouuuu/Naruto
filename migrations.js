// migrations.js
const db = require('./database');

module.exports = async function runMigrations() {
  console.log('⚙️ Ejecutando migrations...');

  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS value_settings (
        guild_id TEXT PRIMARY KEY,
        alert_channel TEXT,
        alert_role TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS value_periodic (
        id SERIAL PRIMARY KEY,
        guild_id TEXT NOT NULL,
        coin TEXT NOT NULL,
        interval_minutes INTEGER NOT NULL,
        channel_id TEXT NOT NULL,
        last_sent TIMESTAMP,
        enabled BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE (guild_id, coin)
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS value_alerts (
        id SERIAL PRIMARY KEY,
        guild_id TEXT NOT NULL,
        coin TEXT NOT NULL,
        target NUMERIC NOT NULL,
        channel_id TEXT NOT NULL,
        mention_role TEXT,
        triggered BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS value_logs (
        id SERIAL PRIMARY KEY,
        guild_id TEXT,
        coin TEXT,
        old_value NUMERIC,
        new_value NUMERIC,
        percent_change NUMERIC,
        logged_at TIMESTAMP DEFAULT NOW()
      );
    `);

    console.log('✅ Migrations completadas');
  } catch (err) {
    console.error('❌ Migrations error:', err);
    throw err;
  }
};
const db = require('./database');

module.exports = async function runMigrations() {
  console.log('⚙️ Ejecutando migrations...');

  await db.query(`
    CREATE TABLE IF NOT EXISTS value_settings (
      guild_id TEXT PRIMARY KEY,
      alert_channel TEXT,
      alert_role TEXT,
      min_percent NUMERIC DEFAULT 0,
      max_percent NUMERIC DEFAULT 0
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS value_alerts (
      id SERIAL PRIMARY KEY,
      symbol TEXT NOT NULL,
      type TEXT NOT NULL,
      percent NUMERIC NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS value_logs (
      id SERIAL PRIMARY KEY,
      symbol TEXT NOT NULL,
      old_value NUMERIC NOT NULL,
      new_value NUMERIC NOT NULL,
      percent_change NUMERIC NOT NULL,
      logged_at TIMESTAMP DEFAULT NOW()
    );
  `);

  console.log('✅ Migrations completadas');
};

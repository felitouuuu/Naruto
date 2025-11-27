// commands/valuestop.js
const { EmbedBuilder, SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { COINS } = require('../utils/cryptoUtils');

const DB_PATH = path.join(__dirname, '..', 'database', 'value.json');

function ensureDb() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify({}, null, 2), 'utf8');
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}
function saveDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
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
  name: 'valuestop',
  description: 'Detiene una publicación periódica configurada.',
  category: 'Criptos',
  ejemplo: 'valuestop btc',
  syntax: '<prefix> valuestop <moneda>',

  data: new SlashCommandBuilder()
    .setName('valuestop')
    .setDescription('Detener publicación periódica para una moneda')
    .addStringOption(opt => opt.setName('moneda').setDescription('btc, eth, sol, bnb, xrp, doge (o id)').setRequired(true)),

  // Prefijo
  async executeMessage(msg, args) {
    const db = ensureDb();

    if (!memberCanManage(msg.member, db, msg.guild.id)) {
      const embed = new EmbedBuilder().setTitle('Permisos insuficientes').setDescription('Necesitas ser Administrador o tener el rol gestor configurado para usar este comando.').setColor('#ED4245');
      return msg.channel.send({ embeds: [embed] });
    }

    const moneda = (args[0] || '').toLowerCase();
    if (!moneda) {
      const embed = new EmbedBuilder().setTitle('Uso incorrecto del comando').setDescription('Sintaxis: `!valuestop <moneda>`').setColor('#ED4245');
      return msg.channel.send({ embeds: [embed] });
    }

    const coinId = COINS[moneda] || moneda;
    if (!db[msg.guild.id] || !db[msg.guild.id].periodic || !db[msg.guild.id].periodic[coinId]) {
      const embed = new EmbedBuilder().setTitle('No existe la publicación').setDescription('No hay ninguna publicación periódica configurada para esa moneda en este servidor.').setColor('#ED4245');
      return msg.channel.send({ embeds: [embed] });
    }

    delete db[msg.guild.id].periodic[coinId];
    if (db[msg.guild.id].periodic && Object.keys(db[msg.guild.id].periodic).length === 0) delete db[msg.guild.id].periodic;
    if (db[msg.guild.id]._settings && Object.keys(db[msg.guild.id]._settings).length === 0 && !db[msg.guild.id].periodic && !db[msg.guild.id].alerts) delete db[msg.guild.id];
    saveDb(db);

    const embed = new EmbedBuilder().setTitle('Publicación detenida').setDescription(`Se eliminó la publicación periódica para **${coinId}**.`).setColor('#6A0DAD');
    return msg.channel.send({ embeds: [embed] });
  },

  // Slash
  async executeInteraction(interaction) {
    const db = ensureDb();

    if (!memberCanManage(interaction.member, db, interaction.guildId)) {
      const embed = new EmbedBuilder().setTitle('Permisos insuficientes').setDescription('Necesitas ser Administrador o tener el rol gestor configurado para usar este comando.').setColor('#ED4245');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const moneda = (interaction.options.getString('moneda') || '').toLowerCase();
    const coinId = COINS[moneda] || moneda;

    if (!db[interaction.guildId] || !db[interaction.guildId].periodic || !db[interaction.guildId].periodic[coinId]) {
      const embed = new EmbedBuilder().setTitle('No existe la publicación').setDescription('No hay ninguna publicación periódica configurada para esa moneda en este servidor.').setColor('#ED4245');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    delete db[interaction.guildId].periodic[coinId];
    if (db[interaction.guildId].periodic && Object.keys(db[interaction.guildId].periodic).length === 0) delete db[interaction.guildId].periodic;
    if (db[interaction.guildId]._settings && Object.keys(db[interaction.guildId]._settings).length === 0 && !db[interaction.guildId].periodic && !db[interaction.guildId].alerts) delete db[interaction.guildId];
    saveDb(db);

    const embed = new EmbedBuilder().setTitle('Publicación detenida').setDescription(`Se eliminó la publicación periódica para **${coinId}**.`).setColor('#6A0DAD');
    return interaction.reply({ embeds: [embed] });
  }
};
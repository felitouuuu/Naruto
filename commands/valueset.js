// commands/valueset.js
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
  name: 'valueset',
  description: 'Configura publicaciones periódicas del precio de una criptomoneda en un canal.',
  category: 'Criptos',
  ejemplo: 'valueset btc 60 #canal (min 30, max 1440 minutos)',
  syntax: '<prefix> valueset <moneda> <interval_minutos> <#canal>',

  data: new SlashCommandBuilder()
    .setName('valueset')
    .setDescription('Configura publicaciones periódicas (min 30m, max 1440m)')
    .addStringOption(opt => opt.setName('moneda').setDescription('btc, eth, sol, bnb, xrp, doge').setRequired(true))
    .addIntegerOption(opt => opt.setName('intervalo').setDescription('Intervalo en minutos (30-1440)').setRequired(true))
    .addChannelOption(opt => opt.setName('canal').setDescription('Canal donde se publicará').setRequired(true)),

  // Prefijo
  async executeMessage(msg, args) {
    const db = ensureDb();

    if (!memberCanManage(msg.member, db, msg.guild.id)) {
      const e = new EmbedBuilder().setTitle('Permisos insuficientes').setColor('#ED4245')
        .setDescription('Necesitas ser Administrador o tener el rol gestor configurado para usar este comando.');
      return msg.channel.send({ embeds: [e] });
    }

    const moneda = (args[0] || '').toLowerCase();
    const intervaloRaw = args[1];
    const canalMention = args.slice(2).join(' ') || '';

    if (!moneda || !intervaloRaw || !canalMention) {
      const embed = new EmbedBuilder()
        .setTitle('Uso incorrecto del comando')
        .setColor('#ED4245')
        .setDescription('Sintaxis: `!valueset <moneda> <interval_minutos> <#canal>`\nEj: `!valueset btc 60 #crypto-updates` (min 30, max 1440)');
      return msg.channel.send({ embeds: [embed] });
    }

    const coinId = COINS[moneda] || moneda;
    const intervalo = Number(intervaloRaw);
    if (isNaN(intervalo) || intervalo < 30 || intervalo > 1440) {
      const embed = new EmbedBuilder()
        .setTitle('Intervalo inválido')
        .setColor('#ED4245')
        .setDescription('El intervalo debe ser un número entre 30 y 1440 (minutos).');
      return msg.channel.send({ embeds: [embed] });
    }

    const channelIdMatch = canalMention.match(/<#(\d+)>/) || canalMention.match(/(\d{17,19})/);
    const channelId = channelIdMatch ? channelIdMatch[1] : null;
    const channel = channelId ? msg.guild.channels.cache.get(channelId) : null;
    if (!channel) {
      const embed = new EmbedBuilder().setTitle('Canal no válido').setDescription('No pude encontrar ese canal en este servidor. Menciona el canal o pega su ID.').setColor('#ED4245');
      return msg.channel.send({ embeds: [embed] });
    }

    if (!db[msg.guild.id]) db[msg.guild.id] = {};
    if (!db[msg.guild.id]._settings) db[msg.guild.id]._settings = {};

    if (!db[msg.guild.id].periodic) db[msg.guild.id].periodic = {};
    // Guardar: coinId (ej: bitcoin) -> { interval, channel, lastSent }
    db[msg.guild.id].periodic[coinId] = { interval: intervalo, channel: channel.id, lastSent: 0 };
    saveDb(db);

    const embed = new EmbedBuilder()
      .setTitle('Publicación periódica configurada')
      .setColor('#6A0DAD')
      .setDescription(`Se configuró publicación para **${coinId}** cada **${intervalo} minutos** en ${channel}.`);
    return msg.channel.send({ embeds: [embed] });
  },

  // Slash
  async executeInteraction(interaction) {
    const db = ensureDb();
    const member = interaction.member;
    if (!memberCanManage(member, db, interaction.guildId)) {
      const e = new EmbedBuilder().setTitle('Permisos insuficientes').setColor('#ED4245')
        .setDescription('Necesitas ser Administrador o tener el rol gestor configurado para usar este comando.');
      return interaction.reply({ embeds: [e], ephemeral: true });
    }

    const moneda = (interaction.options.getString('moneda') || '').toLowerCase();
    const intervalo = interaction.options.getInteger('intervalo');
    const canal = interaction.options.getChannel('canal');

    if (!moneda || !intervalo || !canal) {
      const embed = new EmbedBuilder()
        .setTitle('Uso incorrecto del comando')
        .setColor('#ED4245')
        .setDescription('Sintaxis: `/valueset moneda:<moneda> intervalo:<minutos> canal:<canal>`');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const coinId = COINS[moneda] || moneda;
    if (isNaN(Number(intervalo)) || intervalo < 30 || intervalo > 1440) {
      const embed = new EmbedBuilder().setTitle('Intervalo inválido').setDescription('El intervalo debe ser entre 30 y 1440 minutos.').setColor('#ED4245');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (!db[interaction.guildId]) db[interaction.guildId] = {};
    if (!db[interaction.guildId]._settings) db[interaction.guildId]._settings = {};
    if (!db[interaction.guildId].periodic) db[interaction.guildId].periodic = {};

    db[interaction.guildId].periodic[coinId] = { interval: Number(intervalo), channel: canal.id, lastSent: 0 };
    saveDb(db);

    const embed = new EmbedBuilder()
      .setTitle('Publicación periódica configurada')
      .setColor('#6A0DAD')
      .setDescription(`Se configuró publicación para **${coinId}** cada **${intervalo} minutos** en ${canal}.`);

    return interaction.reply({ embeds: [embed] });
  }
};
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
  // Administrador siempre puede
  try {
    if (member.permissions && member.permissions.has && member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
    // si hay rol gestor configurado, comprobar que lo tenga
    const settings = db[guildId] && db[guildId]._settings;
    if (settings && settings.managerRole && member.roles && member.roles.cache) {
      return member.roles.cache.has(settings.managerRole);
    }
  } catch {}
  return false;
}

module.exports = {
  name: 'valueset',
  description: 'Configura una alerta automática para una criptomoneda en un canal.',
  category: 'Criptos',
  ejemplo: 'valueset btc 90000 #alertas',
  syntax: '<prefix_actual> valueset <moneda> <precio_objetivo> <#canal>',

  data: new SlashCommandBuilder()
    .setName('valueset')
    .setDescription('Configura una alerta automática para una criptomoneda en un canal')
    .addStringOption(opt => opt.setName('moneda').setDescription('btc, eth, sol, bnb, xrp, doge').setRequired(true))
    .addNumberOption(opt => opt.setName('objetivo').setDescription('Precio objetivo en USD').setRequired(true))
    .addChannelOption(opt => opt.setName('canal').setDescription('Canal donde se enviará la alerta').setRequired(true)),

  // Prefijo
  async executeMessage(msg, args) {
    const db = ensureDb();

    // permisos: admin OR rol gestor
    if (!memberCanManage(msg.member, db, msg.guild.id)) {
      const e = new EmbedBuilder().setTitle('Permisos insuficientes').setColor('#ED4245')
        .setDescription('Necesitas ser Administrador o tener el rol gestor configurado para usar este comando.');
      return msg.channel.send({ embeds: [e] });
    }

    const moneda = (args[0] || '').toLowerCase();
    const objetivoRaw = args[1];
    const canalMention = args.slice(2).join(' ') || '';

    if (!moneda || !objetivoRaw || !canalMention) {
      const embed = new EmbedBuilder()
        .setTitle('Uso incorrecto del comando')
        .setColor('#ED4245')
        .setDescription('Sintaxis: `!valueset <moneda> <precio_objetivo> <#canal>`\n\nEj: `!valueset btc 90000 #alertas`');
      return msg.channel.send({ embeds: [embed] });
    }

    const coinId = COINS[moneda] || moneda;
    const objetivo = Number(objetivoRaw);
    if (isNaN(objetivo) || objetivo <= 0) {
      const embed = new EmbedBuilder().setTitle('Uso incorrecto').setDescription('El precio objetivo debe ser un número mayor que 0.').setColor('#ED4245');
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
    if (!db[msg.guild.id]._settings) db[msg.guild.id]._settings = db[msg.guild.id]._settings || {};
    // Guardar con key coinId para soportar id largos
    db[msg.guild.id][coinId] = { target: objetivo, channel: channel.id };
    saveDb(db);

    const embed = new EmbedBuilder()
      .setTitle('Alerta configurada')
      .setColor('#6A0DAD')
      .setDescription(`Se configuró alerta para **${coinId}** a **$${objetivo}** en ${channel}.`);
    return msg.channel.send({ embeds: [embed] });
  },

  // Slash
  async executeInteraction(interaction) {
    const db = ensureDb();

    // permisos: admin OR rol gestor
    const member = interaction.member;
    if (!memberCanManage(member, db, interaction.guildId)) {
      const e = new EmbedBuilder().setTitle('Permisos insuficientes').setColor('#ED4245')
        .setDescription('Necesitas ser Administrador o tener el rol gestor configurado para usar este comando.');
      return interaction.reply({ embeds: [e], ephemeral: true });
    }

    const moneda = (interaction.options.getString('moneda') || '').toLowerCase();
    const objetivo = interaction.options.getNumber('objetivo');
    const canal = interaction.options.getChannel('canal');

    if (!moneda || !objetivo || !canal) {
      const embed = new EmbedBuilder()
        .setTitle('Uso incorrecto del comando')
        .setColor('#ED4245')
        .setDescription('Sintaxis: `/valueset moneda:<moneda> objetivo:<precio> canal:<canal>`');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const coinId = COINS[moneda] || moneda;
    if (isNaN(Number(objetivo)) || Number(objetivo) <= 0) {
      const embed = new EmbedBuilder().setTitle('Uso incorrecto').setDescription('El precio objetivo debe ser un número mayor que 0.').setColor('#ED4245');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (!db[interaction.guildId]) db[interaction.guildId] = {};
    if (!db[interaction.guildId]._settings) db[interaction.guildId]._settings = db[interaction.guildId]._settings || {};
    db[interaction.guildId][coinId] = { target: Number(objetivo), channel: canal.id };
    saveDb(db);

    const embed = new EmbedBuilder()
      .setTitle('Alerta configurada')
      .setColor('#6A0DAD')
      .setDescription(`Se configuró alerta para **${coinId}** a **$${Number(objetivo)}** en ${canal}.`);

    return interaction.reply({ embeds: [embed] });
  }
};
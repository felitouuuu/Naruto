// commands/valueset.js
const { EmbedBuilder, SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const { COINS } = require('../utils/cryptoUtils');
const dbhelper = require('../dbhelper.js');

function formatCoinId(input) {
  return (COINS[input] || input).toLowerCase();
}
async function memberCanManage(member, guildId) {
  if (!member) return false;
  try {
    if (member.permissions && member.permissions.has && member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
    const settings = await dbhelper.getSettings(guildId);
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

  async executeMessage(msg, args) {
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

    if (!await memberCanManage(msg.member, msg.guild.id)) {
      const e = new EmbedBuilder().setTitle('Permisos insuficientes').setColor('#ED4245')
        .setDescription('Necesitas ser Administrador o tener el rol gestor configurado para usar este comando.');
      return msg.channel.send({ embeds: [e] });
    }

    const coinId = formatCoinId(moneda);
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

    try {
      await dbhelper.setPeriodic(msg.guild.id, coinId, intervalo, channel.id);
    } catch (err) {
      console.error('Error guardando periodic:', err);
      return msg.channel.send({ embeds: [new EmbedBuilder().setTitle('❌ Error').setDescription('No pude guardar la configuración en la DB.').setColor('#ED4245')] });
    }

    const embed = new EmbedBuilder()
      .setTitle('Publicación periódica configurada')
      .setColor('#6A0DAD')
      .setDescription(`Se configuró publicación para **${coinId}** cada **${intervalo} minutos** en ${channel}.`);
    return msg.channel.send({ embeds: [embed] });
  },

  async executeInteraction(interaction) {
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

    if (!await memberCanManage(interaction.member, interaction.guildId)) {
      const e = new EmbedBuilder().setTitle('Permisos insuficientes').setColor('#ED4245')
        .setDescription('Necesitas ser Administrador o tener el rol gestor configurado para usar este comando.');
      return interaction.reply({ embeds: [e], ephemeral: true });
    }

    const coinId = formatCoinId(moneda);
    if (isNaN(Number(intervalo)) || intervalo < 30 || intervalo > 1440) {
      const embed = new EmbedBuilder().setTitle('Intervalo inválido').setDescription('El intervalo debe ser entre 30 y 1440 minutos.').setColor('#ED4245');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    try {
      await dbhelper.setPeriodic(interaction.guildId, coinId, Number(intervalo), canal.id);
    } catch (err) {
      console.error('Error guardando periodic (slash):', err);
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('❌ Error').setDescription('No pude guardar la configuración en la DB.').setColor('#ED4245')], ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle('Publicación periódica configurada')
      .setColor('#6A0DAD')
      .setDescription(`Se configuró publicación para **${coinId}** cada **${intervalo} minutos** en ${canal}.`);

    return interaction.reply({ embeds: [embed] });
  }
};
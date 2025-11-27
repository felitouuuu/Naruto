// commands/valuestop.js
const { EmbedBuilder, SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const { COINS } = require('../utils/cryptoUtils');
const dbhelper = require('../dbhelper');

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
  name: 'valuestop',
  description: 'Detiene una publicación periódica configurada.',
  category: 'Criptos',
  ejemplo: 'valuestop btc',
  syntax: '<prefix> valuestop <moneda>',

  data: new SlashCommandBuilder()
    .setName('valuestop')
    .setDescription('Detener publicación periódica para una moneda')
    .addStringOption(opt => opt.setName('moneda').setDescription('btc, eth, sol, bnb, xrp, doge (o id)').setRequired(true)),

  async executeMessage(msg, args) {
    const moneda = (args[0] || '').toLowerCase();

    if (!moneda) {
      const embed = new EmbedBuilder().setTitle('Uso incorrecto del comando').setDescription('Sintaxis: `!valuestop <moneda>`').setColor('#ED4245');
      return msg.channel.send({ embeds: [embed] });
    }

    if (!await memberCanManage(msg.member, msg.guild.id)) {
      const embed = new EmbedBuilder().setTitle('Permisos insuficientes').setDescription('Necesitas ser Administrador o tener el rol gestor configurado para usar este comando.').setColor('#ED4245');
      return msg.channel.send({ embeds: [embed] });
    }

    const coinId = formatCoinId(moneda);

    try {
      const existing = await dbhelper.getPeriodic(msg.guild.id, coinId);
      if (!existing) {
        const embed = new EmbedBuilder().setTitle('No existe la publicación').setDescription('No hay ninguna publicación periódica configurada para esa moneda en este servidor.').setColor('#ED4245');
        return msg.channel.send({ embeds: [embed] });
      }

      await dbhelper.deletePeriodic(msg.guild.id, coinId);
    } catch (err) {
      console.error('Error eliminando periodic:', err);
      return msg.channel.send({ embeds: [new EmbedBuilder().setTitle('❌ Error').setDescription('No pude eliminar la configuración en la DB.').setColor('#ED4245')] });
    }

    const embed = new EmbedBuilder().setTitle('Publicación detenida').setDescription(`Se eliminó la publicación periódica para **${coinId}**.`).setColor('#6A0DAD');
    return msg.channel.send({ embeds: [embed] });
  },

  async executeInteraction(interaction) {
    const moneda = (interaction.options.getString('moneda') || '').toLowerCase();

    if (!await memberCanManage(interaction.member, interaction.guildId)) {
      const embed = new EmbedBuilder().setTitle('Permisos insuficientes').setDescription('Necesitas ser Administrador o tener el rol gestor configurado para usar este comando.').setColor('#ED4245');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const coinId = formatCoinId(moneda);

    try {
      const existing = await dbhelper.getPeriodic(interaction.guildId, coinId);
      if (!existing) {
        const embed = new EmbedBuilder().setTitle('No existe la publicación').setDescription('No hay ninguna publicación periódica configurada para esa moneda en este servidor.').setColor('#ED4245');
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      await dbhelper.deletePeriodic(interaction.guildId, coinId);
    } catch (err) {
      console.error('Error eliminando periodic (slash):', err);
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('❌ Error').setDescription('No pude eliminar la configuración en la DB.').setColor('#ED4245')] , ephemeral: true });
    }

    const embed = new EmbedBuilder().setTitle('Publicación detenida').setDescription(`Se eliminó la publicación periódica para **${coinId}**.`).setColor('#6A0DAD');
    return interaction.reply({ embeds: [embed] });
  }
};
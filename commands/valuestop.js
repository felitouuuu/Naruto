const { EmbedBuilder, SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const { COINS } = require('../utils/cryptoUtils');
const dbhelper = require('../dbhelper.js');

function formatCoinKey(input) {
  return (input || '').toLowerCase();
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
    // permisos primero
    if (!await memberCanManage(msg.member, msg.guild.id)) {
      const embed = new EmbedBuilder().setTitle('Permisos insuficientes').setDescription('Necesitas ser Administrador o tener el rol gestor configurado para usar este comando.').setColor('#ED4245');
      return msg.channel.send({ embeds: [embed] });
    }

    const moneda = (args[0] || '').toLowerCase();
    if (!moneda) {
      const embed = new EmbedBuilder().setTitle('Uso incorrecto del comando').setDescription('Sintaxis: `!valuestop <moneda>`').setColor('#ED4245');
      return msg.channel.send({ embeds: [embed] });
    }

    const coinKey = formatCoinKey(moneda);
    if (!COINS[coinKey]) {
      const embed = new EmbedBuilder().setTitle('Moneda no soportada').setColor('#ED4245')
        .setDescription(`Solo se permiten las monedas predefinidas. Soportadas: ${Object.keys(COINS).map(k => `\`${k}\``).join(', ')}`);
      return msg.channel.send({ embeds: [embed] });
    }

    try {
      const existing = await dbhelper.getPeriodic(msg.guild.id, COINS[coinKey]);
      if (!existing) {
        const embed = new EmbedBuilder().setTitle('No existe la publicación').setDescription('No hay ninguna publicación periódica configurada para esa moneda en este servidor.').setColor('#ED4245');
        return msg.channel.send({ embeds: [embed] });
      }

      await dbhelper.deletePeriodic(msg.guild.id, COINS[coinKey]);
    } catch (err) {
      console.error('Error eliminando periodic:', err);
      return msg.channel.send({ embeds: [new EmbedBuilder().setTitle('❌ Error').setDescription('No pude eliminar la configuración en la DB.').setColor('#ED4245')] });
    }

    const embed = new EmbedBuilder().setTitle('Publicación detenida').setDescription(`Se eliminó la publicación periódica para **${coinKey}**.`).setColor('#6A0DAD');
    return msg.channel.send({ embeds: [embed] });
  },

  async executeInteraction(interaction) {
    // permisos primero
    if (!await memberCanManage(interaction.member, interaction.guildId)) {
      const embed = new EmbedBuilder().setTitle('Permisos insuficientes').setDescription('Necesitas ser Administrador o tener el rol gestor configurado para usar este comando.').setColor('#ED4245');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const moneda = (interaction.options.getString('moneda') || '').toLowerCase();
    if (!moneda) return interaction.reply({ embeds: [new EmbedBuilder().setTitle('Uso incorrecto del comando').setDescription('Sintaxis: `/valuestop moneda:<moneda>`').setColor('#ED4245')], ephemeral: true });

    const coinKey = formatCoinKey(moneda);
    if (!COINS[coinKey]) {
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('Moneda no soportada').setColor('#ED4245').setDescription(`Soportadas: ${Object.keys(COINS).map(k => `\`${k}\``).join(', ')}`)], ephemeral: true });
    }

    try {
      const existing = await dbhelper.getPeriodic(interaction.guildId, COINS[coinKey]);
      if (!existing) {
        return interaction.reply({ embeds: [new EmbedBuilder().setTitle('No existe la publicación').setDescription('No hay ninguna publicación periódica configurada para esa moneda en este servidor.').setColor('#ED4245')], ephemeral: true });
      }

      await dbhelper.deletePeriodic(interaction.guildId, COINS[coinKey]);
    } catch (err) {
      console.error('Error eliminando periodic (slash):', err);
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('❌ Error').setDescription('No pude eliminar la configuración en la DB.').setColor('#ED4245')], ephemeral: true });
    }

    const embed = new EmbedBuilder().setTitle('Publicación detenida').setDescription(`Se eliminó la publicación periódica para **${coinKey}**.`).setColor('#6A0DAD');
    return interaction.reply({ embeds: [embed] });
  }
};
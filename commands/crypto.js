// commands/crypto.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getCryptoPrice } = require('../utils/cryptoUtils');


module.exports = {
  name: 'crypto',
  description: 'Muestra el precio actual de una criptomoneda.',
  category: 'Criptos',
  ejemplo: 'crypto btc',
  syntax: '!crypto <moneda>',

  data: new SlashCommandBuilder()
    .setName('crypto')
    .setDescription('Ver precio en tiempo real de una moneda')
    .addStringOption(opt =>
      opt.setName('moneda')
         .setDescription('btc, eth, sol, bnb, xrp, doge')
         .setRequired(true)
    ),

  async executeMessage(msg, args) {
    const symbol = (args[0] || '').toLowerCase();
    if (!symbol || !COINS[symbol]) {
      return msg.reply('❌ Moneda no válida. Ej: btc, eth, sol, bnb, xrp, doge');
    }

    const data = await getPrice(symbol).catch(() => null);
    if (!data) return msg.reply('❌ Error obteniendo el precio.');

    const embed = new EmbedBuilder()
      .setTitle(`💰 ${symbol.toUpperCase()} — $${Number(data.price).toLocaleString()} USD`)
      .addFields(
        { name: 'Cambio 24h', value: `${(data.change24h || 0).toFixed(2)}%`, inline: true },
        { name: 'Última actualización', value: data.lastUpdatedAt ? new Date(data.lastUpdatedAt * 1000).toUTCString() : 'N/A', inline: true },
        { name: 'Fuente', value: 'CoinGecko', inline: true }
      )
      .setColor('#f0b90b')
      .setTimestamp();

    return msg.reply({ embeds: [embed] });
  },

  async executeInteraction(interaction) {
    const symbol = (interaction.options.getString('moneda') || '').toLowerCase();
    if (!symbol || !COINS[symbol]) {
      return interaction.reply({ content: '❌ Moneda no válida.', ephemeral: true });
    }

    const data = await getPrice(symbol).catch(() => null);
    if (!data) return interaction.reply({ content: '❌ Error obteniendo el precio.', ephemeral: true });

    const embed = new EmbedBuilder()
      .setTitle(`💰 ${symbol.toUpperCase()} — $${Number(data.price).toLocaleString()} USD`)
      .addFields(
        { name: 'Cambio 24h', value: `${(data.change24h || 0).toFixed(2)}%`, inline: true },
        { name: 'Última actualización', value: data.lastUpdatedAt ? new Date(data.lastUpdatedAt * 1000).toUTCString() : 'N/A', inline: true },
        { name: 'Fuente', value: 'CoinGecko', inline: true }
      )
      .setColor('#f0b90b')
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }
};

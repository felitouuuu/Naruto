// commands/crypto.js
const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const { getCryptoPrice, COINS } = require('../utils/cryptoUtils');

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
      opt.setName('moneda').setDescription('btc, eth, sol, bnb, xrp, doge (o id)').setRequired(true)
    ),

  // <-- llamado por index.js cuando usan prefijo
  async executeMessage(msg, args) {
    const symbol = (args[0] || '').toLowerCase();
    if (!symbol || (!COINS[symbol] && symbol.length < 3)) {
      return msg.reply('❌ Moneda no válida. Ej: `!crypto btc` (soportadas: btc, eth, sol, bnb, xrp, doge)');
    }

    const data = await getCryptoPrice(symbol);
    if (!data || data.price === null) return msg.reply('❌ No pude obtener datos de CoinGecko para esa moneda.');

    const priceStr = Number(data.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const changeStr = (Number(data.change24h) || 0).toFixed(2) + '%';
    const updated = data.lastUpdatedAt ? new Date(data.lastUpdatedAt * 1000).toUTCString() : 'N/A';

    const embed = new EmbedBuilder()
      .setTitle(`💰 ${symbol.toUpperCase()} — $${priceStr} USD`)
      .setColor('#ffbf00')
      .addFields(
        { name: 'Cambio 24h', value: changeStr, inline: true },
        { name: 'Última actualización', value: updated, inline: true },
        { name: 'Fuente', value: 'CoinGecko', inline: true }
      )
      .setTimestamp();

    return msg.channel.send({ embeds: [embed] });
  },

  // <-- llamado por index.js cuando usan slash
  async executeInteraction(interaction) {
    const symbol = (interaction.options.getString('moneda') || '').toLowerCase();
    if (!symbol) return interaction.reply({ content: '❌ Falta la moneda.', ephemeral: true });

    const data = await getCryptoPrice(symbol);
    if (!data || data.price === null) return interaction.reply({ content: '❌ No pude obtener datos de CoinGecko para esa moneda.', ephemeral: true });

    const priceStr = Number(data.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const changeStr = (Number(data.change24h) || 0).toFixed(2) + '%';
    const updated = data.lastUpdatedAt ? new Date(data.lastUpdatedAt * 1000).toUTCString() : 'N/A';

    const embed = new EmbedBuilder()
      .setTitle(`💰 ${symbol.toUpperCase()} — $${priceStr} USD`)
      .setColor('#ffbf00')
      .addFields(
        { name: 'Cambio 24h', value: changeStr, inline: true },
        { name: 'Última actualización', value: updated, inline: true },
        { name: 'Fuente', value: 'CoinGecko', inline: true }
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }
};
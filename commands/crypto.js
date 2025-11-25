const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const { getCryptoPrice, COINS } = require('../utils/cryptoUtils');

const SUCCESS_COLOR = '#6A0DAD';
const ERROR_COLOR = '#ED4245';

const EMOJIS = {
  btc: '<:bitcoin:1442753420145725492>',
  eth: '<:eth:1442753368291283044>',
  sol: '<:solana:1442753317389467699>',
  bnb: '<:bnb:1442753271629615157>',
  xrp: '<:xrp:1442753138254680156>',
  doge: '<:dogecoin:1442753221717262336>'
};

const SUPPORTED_KEYS = Object.keys(EMOJIS);
const SUPPORTED_LIST = SUPPORTED_KEYS.map(k => `${EMOJIS[k]} \`${k}\``).join('\n');

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
      opt.setName('moneda').setDescription('btc, eth, sol, bnb, xrp, doge (o id)').setRequired(false)
    ),

  // Prefijo
  async executeMessage(msg, args) {
    const raw = (args[0] || '').toLowerCase();

    // --- Uso incorrecto: no puso moneda
    if (!raw) {
      const invalidEmbed = new EmbedBuilder()
        .setAuthor({ name: 'Uso incorrecto del comando' })
        .setColor(ERROR_COLOR)
        .setDescription(
          'Debes escribir el **nombre** o **ID** de la moneda que deseas consultar.\n\n' +
          '**Monedas disponibles:**\n' +
          SUPPORTED_LIST
        )
        .setTimestamp();
      return msg.channel.send({ embeds: [invalidEmbed] });
    }

    const symbol = raw;
    // Si no es una abreviatura conocida y es muy corto, considerarlo inválido
    if (!COINS[symbol] && symbol.length < 3 && !SUPPORTED_KEYS.includes(symbol)) {
      const invalidEmbed = new EmbedBuilder()
        .setAuthor({ name: 'Uso incorrecto del comando' })
        .setColor(ERROR_COLOR)
        .setDescription(
          'Moneda no válida.\n\n' +
          '**Monedas disponibles:**\n' +
          SUPPORTED_LIST
        )
        .setTimestamp();
      return msg.channel.send({ embeds: [invalidEmbed] });
    }

    // Determinar id para la API (acepta 'btc' o 'bitcoin')
    const id = COINS[symbol] || symbol;
    const data = await getCryptoPrice(id);

    if (!data || data.price === null) {
      const errEmbed = new EmbedBuilder()
        .setAuthor({ name: 'Error al obtener datos' })
        .setColor(ERROR_COLOR)
        .setDescription('No pude obtener datos de CoinGecko para esa moneda. Intenta más tarde.')
        .setTimestamp();
      return msg.channel.send({ embeds: [errEmbed] });
    }

    const priceStr = Number(data.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const changeStr = (Number(data.change24h) || 0).toFixed(2) + '%';
    const updated = data.lastUpdatedAt ? new Date(data.lastUpdatedAt * 1000).toUTCString() : 'N/A';

    // Elegir emoji: por símbolo corto o por id
    const emoji = EMOJIS[symbol] || EMOJIS[Object.keys(COINS).find(k => COINS[k] === id)] || '💰';

    const embed = new EmbedBuilder()
      .setTitle(`${emoji} ${symbol.toUpperCase()} — $${priceStr} USD`)
      .setColor(SUCCESS_COLOR)
      .addFields(
        { name: 'Cambio 24h', value: changeStr, inline: true },
        { name: 'Última actualización', value: updated, inline: true },
        { name: 'Fuente', value: 'CoinGecko', inline: true }
      )
      .setTimestamp();

    return msg.channel.send({ embeds: [embed] });
  },

  // Slash
  async executeInteraction(interaction) {
    const raw = (interaction.options.getString('moneda') || '').toLowerCase();

    if (!raw) {
      const invalidEmbed = new EmbedBuilder()
        .setAuthor({ name: 'Uso incorrecto del comando' })
        .setColor(ERROR_COLOR)
        .setDescription(
          'Debes escribir el **nombre** o **ID** de la moneda que deseas consultar.\n\n' +
          '**Monedas disponibles:**\n' +
          SUPPORTED_LIST
        )
        .setTimestamp();
      return interaction.reply({ embeds: [invalidEmbed] });
    }

    const symbol = raw;
    if (!COINS[symbol] && symbol.length < 3 && !SUPPORTED_KEYS.includes(symbol)) {
      const invalidEmbed = new EmbedBuilder()
        .setAuthor({ name: 'Uso incorrecto del comando' })
        .setColor(ERROR_COLOR)
        .setDescription(
          'Moneda no válida.\n\n' +
          '**Monedas disponibles:**\n' +
          SUPPORTED_LIST
        )
        .setTimestamp();
      return interaction.reply({ embeds: [invalidEmbed] });
    }

    const id = COINS[symbol] || symbol;
    const data = await getCryptoPrice(id);

    if (!data || data.price === null) {
      const errEmbed = new EmbedBuilder()
        .setAuthor({ name: 'Error al obtener datos' })
        .setColor(ERROR_COLOR)
        .setDescription('No pude obtener datos de CoinGecko para esa moneda. Intenta más tarde.')
        .setTimestamp();
      return interaction.reply({ embeds: [errEmbed] });
    }

    const priceStr = Number(data.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const changeStr = (Number(data.change24h) || 0).toFixed(2) + '%';
    const updated = data.lastUpdatedAt ? new Date(data.lastUpdatedAt * 1000).toUTCString() : 'N/A';

    const emoji = EMOJIS[symbol] || EMOJIS[Object.keys(COINS).find(k => COINS[k] === id)] || '💰';

    const embed = new EmbedBuilder()
      .setTitle(`${emoji} ${symbol.toUpperCase()} — $${priceStr} USD`)
      .setColor(SUCCESS_COLOR)
      .addFields(
        { name: 'Cambio 24h', value: changeStr, inline: true },
        { name: 'Última actualización', value: updated, inline: true },
        { name: 'Fuente', value: 'CoinGecko', inline: true }
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }
};
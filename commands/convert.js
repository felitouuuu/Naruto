// commands/convert.js
const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const { COINS, getCryptoPrice } = require('../utils/cryptoUtils');

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

function findId(token) {
  if (!token) return null;
  token = token.toLowerCase();
  return COINS[token] || token;
}

function pickEmoji(sym) {
  const key = Object.keys(COINS).find(k => COINS[k] === sym) || sym;
  return EMOJIS[key] || '💱';
}

module.exports = {
  name: 'convert',
  description: 'Convierte una cantidad de una cripto a otra al precio actual.',
  category: 'Criptos',
  ejemplo: 'convert 2 btc eth',
  syntax: '!convert <cantidad> <from> <to>',

  data: new SlashCommandBuilder()
    .setName('convert')
    .setDescription('Convierte cantidad de una moneda a otra')
    .addNumberOption(opt => opt.setName('cantidad').setDescription('Cantidad a convertir').setRequired(true))
    .addStringOption(opt => opt.setName('from').setDescription('De (btc, eth, etc)').setRequired(true))
    .addStringOption(opt => opt.setName('to').setDescription('A (btc, eth, usd)').setRequired(true)),

  async executeMessage(msg, args) {
    const cantidad = Number(args[0]);
    const fromRaw = (args[1] || '').toLowerCase();
    const toRaw = (args[2] || '').toLowerCase();

    if (!cantidad || isNaN(cantidad) || !fromRaw || !toRaw) {
      return msg.channel.send({ embeds: [new EmbedBuilder().setTitle('Uso incorrecto').setDescription('Sintaxis: `!convert <cantidad> <from> <to>` Ej: `!convert 2 btc usd`').setColor(ERROR_COLOR)] });
    }

    const fromId = findId(fromRaw);
    const toId = findId(toRaw);

    try {
      // if converting to fiat (usd) then get price of fromId in usd
      if (toRaw === 'usd' || toRaw === 'usdt' || toRaw === 'usd*') {
        const data = await getCryptoPrice(fromId);
        if (!data || data.price === null) throw new Error('No price');
        const result = cantidad * Number(data.price);
        const embed = new EmbedBuilder()
          .setTitle(`${pickEmoji(fromId)} Conversión`)
          .setColor(SUCCESS_COLOR)
          .setDescription(`**${cantidad} ${fromRaw.toUpperCase()}** = **$${result.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD**`)
          .setTimestamp();
        return msg.channel.send({ embeds: [embed] });
      }

      // both cryptos -> get both prices in USD then divide
      const pFrom = await getCryptoPrice(fromId);
      const pTo = await getCryptoPrice(toId);
      if (!pFrom || pFrom.price === null || !pTo || pTo.price === null) throw new Error('No price(s)');
      const usdFrom = Number(pFrom.price);
      const usdTo = Number(pTo.price);
      const equivalent = (cantidad * usdFrom) / usdTo;

      const embed = new EmbedBuilder()
        .setTitle(`${pickEmoji(fromId)} → ${pickEmoji(toId)} Conversión`)
        .setColor(SUCCESS_COLOR)
        .setDescription(`**${cantidad} ${fromRaw.toUpperCase()}** ≈ **${equivalent.toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 6 })} ${toRaw.toUpperCase()}**\n\n(Precios en tiempo real - fuente: CoinGecko)`)
        .setTimestamp();

      return msg.channel.send({ embeds: [embed] });
    } catch (err) {
      console.error('convert err', err);
      return msg.channel.send({ embeds: [new EmbedBuilder().setTitle('Error').setDescription('No pude obtener precios para la conversión. Comprueba las monedas.') .setColor(ERROR_COLOR)] });
    }
  },

  // Slash
  async executeInteraction(interaction) {
    const cantidad = interaction.options.getNumber('cantidad');
    const fromRaw = (interaction.options.getString('from') || '').toLowerCase();
    const toRaw = (interaction.options.getString('to') || '').toLowerCase();

    if (!cantidad || !fromRaw || !toRaw) {
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('Uso incorrecto').setDescription('Sintaxis: `/convert cantidad: <n> from: <btc> to: <eth|usd>`').setColor(ERROR_COLOR)], ephemeral: true });
    }

    const fromId = findId(fromRaw);
    const toId = findId(toRaw);

    await interaction.deferReply();
    try {
      if (toRaw === 'usd' || toRaw === 'usdt') {
        const data = await getCryptoPrice(fromId);
        if (!data || data.price === null) throw new Error('No price');
        const result = cantidad * Number(data.price);
        const embed = new EmbedBuilder()
          .setTitle(`${pickEmoji(fromId)} Conversión`)
          .setColor(SUCCESS_COLOR)
          .setDescription(`**${cantidad} ${fromRaw.toUpperCase()}** = **$${result.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD**`)
          .setTimestamp();
        return interaction.editReply({ embeds: [embed] });
      }

      const pFrom = await getCryptoPrice(fromId);
      const pTo = await getCryptoPrice(toId);
      if (!pFrom || pFrom.price === null || !pTo || pTo.price === null) throw new Error('No price(s)');
      const usdFrom = Number(pFrom.price);
      const usdTo = Number(pTo.price);
      const equivalent = (cantidad * usdFrom) / usdTo;

      const embed = new EmbedBuilder()
        .setTitle(`${pickEmoji(fromId)} → ${pickEmoji(toId)} Conversión`)
        .setColor(SUCCESS_COLOR)
        .setDescription(`**${cantidad} ${fromRaw.toUpperCase()}** ≈ **${equivalent.toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 6 })} ${toRaw.toUpperCase()}**\n\n(Precios en tiempo real - fuente: CoinGecko)`)
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('convert slash err', err);
      return interaction.editReply({ embeds: [new EmbedBuilder().setTitle('Error').setDescription('No pude obtener precios para la conversión. Comprueba las monedas.') .setColor(ERROR_COLOR)] });
    }
  }
};
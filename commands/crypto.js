const { EmbedBuilder } = require('discord.js');
const { getCryptoPrice } = require('../utils/cryptoUtils');

module.exports = {
    name: "crypto",
    description: "Muestra el precio actual de una criptomoneda.",
    category: "Criptos",
    usage: "!crypto btc",
    premium: false,

    async execute(client, message, args) {
        const symbol = args[0]?.toLowerCase();

        if (!symbol) {
            return message.reply("Debes escribir una moneda. Ejemplo: `!crypto btc`");
        }

        const data = await getCryptoPrice(symbol);

        if (!data) {
            return message.reply("No encontré esa moneda en CoinGecko.");
        }

        const price = data.price?.toFixed(2) ?? "N/A";
        const change = data.change24h?.toFixed(2) ?? 0;

        const embed = new EmbedBuilder()
            .setTitle(`💰 Precio de ${symbol.toUpperCase()}`)
            .setColor("#ffbf00")
            .addFields(
                { name: `${symbol.toUpperCase()} — $${price} USD`, value: "\u200B" },
                { name: "Cambio 24h", value: `${change}%`, inline: true },
                { name: "Fuente", value: "CoinGecko", inline: true }
            )
            .setTimestamp();

        message.channel.send({ embeds: [embed] });
    }
};
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} = require("discord.js");

const axios = require("axios");

module.exports = {
  name: "cryptochart",
  description: "Muestra un gráfico y datos de una criptomoneda.",
  aliases: ["chart", "crypto"],

  async executeMessage(message, args) {
    const coin = args[0]?.toLowerCase();
    if (!coin) return message.reply("Debes indicar una moneda. Ej: `!cryptochart btc`");

    return sendCrypto(message, coin, "1d");
  },

  async executeInteraction(interaction) {
    const coin = interaction.options.getString("coin").toLowerCase();
    return sendCrypto(interaction, coin, "1d");
  },
};

async function sendCrypto(ctx, coin, range) {
  try {
    const msg = await ctx.reply("Generando gráfica…");

    const rangeMap = {
      "1d": 1,
      "7d": 7,
      "30d": 30,
      "4m": 120,
      "1y": 365,
      "all": "max"
    };

    const days = rangeMap[range];

    // ============================
    // 1) DATOS DE MERCADO
    // ============================
    const market = await axios.get(
      `https://api.coingecko.com/api/v3/coins/${coin}?localization=false&market_data=true`
    ).then(r => r.data.market_data);

    // ============================
    // 2) DATOS DEL GRAFICO
    // ============================
    const chart = await axios.get(
      `https://api.coingecko.com/api/v3/coins/${coin}/market_chart?vs_currency=usd&days=${days}`
    ).then(r => r.data);

    const prices = chart.prices.map(p => ({ x: new Date(p[0]).toISOString(), y: p[1] }));

    // ============================
    // 3) GENERAR QUICKCHART
    // ============================
    const chartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify({
      type: "candlestick",
      data: {
        datasets: [
          {
            label: `${coin.toUpperCase()} Price`,
            data: prices
          }
        ]
      },
      options: {
        scales: {
          x: { type: "timeseries" }
        }
      }
    }))}`;

    // ============================
    // 4) EMBED
    // ============================
    const embed = new EmbedBuilder()
      .setColor("#6A0DAD")
      .setTitle(`📊 ${coin.toUpperCase()} — ${rangeLabel(range)}`)
      .setImage(chartUrl)
      .addFields(
        { name: "💵 Precio actual", value: `$${market.current_price.usd.toLocaleString()}`, inline: true },
        { name: "📈 Market Cap", value: `$${market.market_cap.usd.toLocaleString()}`, inline: true },
        { name: "⏳ ATH", value: `$${market.ath.usd.toLocaleString()}`, inline: true },
        { name: "📉 ATL", value: `$${market.atl.usd.toLocaleString()}`, inline: true },
        {
          name: "📊 Cambios",
          value:
            `1h: **${formatPercent(market.price_change_percentage_1h_in_currency.usd)}**\n` +
            `24h: **${formatPercent(market.price_change_percentage_24h_in_currency.usd)}**\n` +
            `7d: **${formatPercent(market.price_change_percentage_7d_in_currency.usd)}**`,
          inline: true
        }
      )
      .setTimestamp();

    // ============================
    // 5) MENÚ DESPLEGABLE
    // ============================
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`chart_range_${coin}`)
      .setPlaceholder("Selecciona un rango…")
      .addOptions([
        { label: "Último día", value: "1d" },
        { label: "Últimos 7 días", value: "7d" },
        { label: "Últimos 30 días", value: "30d" },
        { label: "Últimos 4 meses", value: "4m" },
        { label: "Último año", value: "1y" },
        { label: "Historial completo", value: "all" }
      ]);

    const row = new ActionRowBuilder().addComponents(menu);

    await msg.edit({ content: "", embeds: [embed], components: [row] });

  } catch (err) {
    console.error("cryptochart error:", err);
    ctx.reply("❌ No se pudo generar la gráfica para esa moneda.");
  }
}

// =======================================
// FUNCIONES AUXILIARES
// =======================================

function rangeLabel(r) {
  return {
    "1d": "Últimas 24 horas",
    "7d": "Últimos 7 días",
    "30d": "Últimos 30 días",
    "4m": "Últimos 4 meses",
    "1y": "Último año",
    "all": "Historial completo"
  }[r];
}

function formatPercent(n) {
  if (n === null || n === undefined) return "N/A";
  const fixed = n.toFixed(2);
  return (n >= 0 ? "🟢 +" : "🔴 ") + fixed + "%";
}
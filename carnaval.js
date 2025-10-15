// 🎭 carnaval.js
// Detecta mensajes de Followed Channel y registra el color del embed en logs

const { EmbedBuilder } = require('discord.js');

const CLIMA_CHANNEL_ID = '1428097401700483203';
const LOGS_CHANNEL_ID = '1428097994657497088';

const RED_BASE_DECIMAL = 0x8E0000; // color base de Luna Sangrienta
const TOLERANCE = 55;

function decimalToRGB(decimal) {
    const r = (decimal >> 16) & 0xFF;
    const g = (decimal >> 8) & 0xFF;
    const b = decimal & 0xFF;
    return { r, g, b };
}

function rgbToHex({ r, g, b }) {
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
}

function compareColor(colorDecimal) {
    if (!colorDecimal) return { hex: '(sin color)', similarity: '❌ No hay color' };

    const { r, g, b } = decimalToRGB(colorDecimal);
    const { r: rBase, g: gBase, b: bBase } = decimalToRGB(RED_BASE_DECIMAL);

    const similar =
        Math.abs(r - rBase) <= TOLERANCE &&
        Math.abs(g - gBase) <= TOLERANCE &&
        Math.abs(b - bBase) <= TOLERANCE
            ? '✅ Similar a color base'
            : '❌ Diferente al color base';

    return { hex: rgbToHex({ r, g, b }), similarity: similar };
}

module.exports = {
    async handleMessage(message) {
        try {
            if (message.channel.id !== CLIMA_CHANNEL_ID) return;
            if (!message.webhookId) return;

            const logsChannel = message.guild.channels.cache.get(LOGS_CHANNEL_ID);
            if (!logsChannel) return;

            let lunaDetectada = false;

            const logEmbed = new EmbedBuilder()
                .setTitle('📩 Mensaje detectado en canal de clima')
                .setColor('#FFA500')
                .setDescription(message.content || '(sin texto)') // aunque el texto sea vacío
                .setTimestamp();

            if (message.embeds.length > 0) {
                message.embeds.forEach((embed, i) => {
                    const { hex, similarity } = compareColor(embed.color);

                    if (similarity.includes('✅')) lunaDetectada = true;

                    logEmbed.addFields({
                        name: `Embed #${i + 1}`,
                        value: `Color del embed enviado: ${hex}\nComparación con color base: ${similarity}`,
                        inline: false
                    });
                });
            } else {
                logEmbed.addFields({
                    name: 'Embeds detectados',
                    value: '(No hay embeds)',
                    inline: false
                });
            }

            await logsChannel.send({ embeds: [logEmbed] });

            // Resultado final
            if (lunaDetectada) {
                await logsChannel.send('✅ **Resultado final:** Luna de Sangre detectada por color rojo.');
                await message.channel.send({
                    content: '@everyone 🌕 **¡Luna de Sangre detectada!** El clima está activo, ¡prepárense para la aventura! ⚔️',
                    allowedMentions: { parse: ['everyone'] },
                });
            } else {
                await logsChannel.send('❌ **Resultado final:** No coincide con Luna de Sangre.');
            }

        } catch (err) {
            console.error('❌ Error en carnaval.js:', err);
        }
    },
};
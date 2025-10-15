// 🎭 carnaval.js
// Detecta mensajes de Followed Channel basados en color rojo del embed y registra colores en logs

const { EmbedBuilder } = require('discord.js');

// IDs de canales configurados
const CLIMA_CHANNEL_ID = '1428097401700483203'; // Canal donde llegan los climas
const LOGS_CHANNEL_ID = '1428097994657497088'; // Canal donde se mandan los logs

// Color base de "Luna Sangrienta"
const RED_BASE_DECIMAL = 0x8E0000; // #8E0000
const TOLERANCE = 55; // tolerancia para tonos similares de rojo

function decimalToRGB(decimal) {
    const r = (decimal >> 16) & 0xFF;
    const g = (decimal >> 8) & 0xFF;
    const b = decimal & 0xFF;
    return { r, g, b };
}

function rgbToHex({ r, g, b }) {
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
}

function isSimilarRed(colorDecimal) {
    const { r, g, b } = decimalToRGB(colorDecimal);
    const { r: rBase, g: gBase, b: bBase } = decimalToRGB(RED_BASE_DECIMAL);
    return Math.abs(r - rBase) <= TOLERANCE &&
           Math.abs(g - gBase) <= TOLERANCE &&
           Math.abs(b - bBase) <= TOLERANCE;
}

module.exports = {
    /**
     * Maneja cada mensaje recibido desde index.js
     * @param {import('discord.js').Message} message
     */
    async handleMessage(message) {
        try {
            if (message.channel.id !== CLIMA_CHANNEL_ID) return;
            if (!message.webhookId) return;

            const logsChannel = message.guild.channels.cache.get(LOGS_CHANNEL_ID);
            if (!logsChannel) {
                console.warn('⚠️ Canal de logs no encontrado.');
                return;
            }

            // Analizar todos los embeds y guardar colores
            const embedLogs = message.embeds.map((embed, i) => {
                const colorHex = embed.color ? rgbToHex(decimalToRGB(embed.color)) : '(sin color)';
                const similar = embed.color && isSimilarRed(embed.color) ? '✅ Similar a rojo base' : '❌ No similar';
                return `Embed #${i + 1}: Color original: ${colorHex} → ${similar}`;
            }).join('\n') || '(No hay embeds)';

            // Crear embed de log
            const logEmbed = new EmbedBuilder()
                .setTitle('📩 Mensaje detectado en canal de clima')
                .setColor('#FFA500')
                .setDescription(message.content || '(sin texto)')
                .addFields(
                    { name: 'Embeds detectados', value: `${message.embeds.length}`, inline: true },
                    { name: 'Colores y comparación', value: embedLogs.length > 1024 ? embedLogs.slice(0, 1021) + '...' : embedLogs, inline: false }
                )
                .setTimestamp();

            await logsChannel.send({ embeds: [logEmbed] });

            // Detectar Luna Sangrienta
            let lunaDetectada = false;
            for (const embed of message.embeds) {
                if (embed.color && isSimilarRed(embed.color)) {
                    lunaDetectada = true;
                    break;
                }
            }

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
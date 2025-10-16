// 🎭 carnaval.js — Detección de climas basada en color de embed o "falsos embeds"
// Compatible con Discord.js v14

const { EmbedBuilder } = require('discord.js');

// 🧩 Configuración de canales
const CLIMA_CHANNEL_ID = '1428097401700483203'; // Canal donde llegan los climas
const LOGS_CHANNEL_ID = '1428097994657497088'; // Canal donde se mandan los logs

// 🧩 Color base de Luna de Sangre (#8E0000 en decimal)
const BASE_COLOR = 0x8E0000;

// 🧮 Rango de tolerancia de similitud de color (0–255 por canal RGB)
const COLOR_TOLERANCE = 25;

// 🧮 Función para medir diferencia entre colores RGB
function colorDifference(c1, c2) {
	const r1 = (c1 >> 16) & 0xff;
	const g1 = (c1 >> 8) & 0xff;
	const b1 = c1 & 0xff;

	const r2 = (c2 >> 16) & 0xff;
	const g2 = (c2 >> 8) & 0xff;
	const b2 = c2 & 0xff;

	// Diferencia absoluta total (menor = más parecido)
	return Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2);
}

// 🎨 Función auxiliar para convertir texto estilo color (#RRGGBB) a número decimal
function parseColorFromText(text) {
	const match = text.match(/#([0-9A-F]{6})/i);
	if (!match) return null;
	return parseInt(match[1], 16);
}

module.exports = {
	/**
	 * Maneja cada mensaje recibido desde index.js
	 * @param {import('discord.js').Message} message
	 */
	async handleMessage(message) {
		try {
			// Ignorar mensajes fuera del canal de clima
			if (message.channel.id !== CLIMA_CHANNEL_ID) return;

			// Ignorar si no proviene de un webhook (solo los reenviados de Discord)
			if (!message.webhookId) return;

			// Buscar canal de logs
			const logsChannel = message.guild.channels.cache.get(LOGS_CHANNEL_ID);
			if (!logsChannel) {
				console.warn('⚠️ Canal de logs no encontrado.');
				return;
			}

			let colorDetectado = null;
			let tipoDeteccion = 'Ninguno';

			// ================================
			// 1️⃣ Detectar color de embed real
			// ================================
			const embed = message.embeds[0];
			if (embed && embed.color) {
				colorDetectado = embed.color;
				tipoDeteccion = 'Embed Real';
			}
			// ============================================
			// 2️⃣ Detectar color en texto tipo “falso embed”
			// ============================================
			else if (message.content && message.content.includes('#')) {
				const colorFromText = parseColorFromText(message.content);
				if (colorFromText) {
					colorDetectado = colorFromText;
					tipoDeteccion = 'Texto Estilo Embed (Markdown)';
				}
			}

			// Si no se encontró color en ningún formato
			if (!colorDetectado) {
				await logsChannel.send('📭 **Mensaje sin color detectado (ni embed ni texto).**');
				return;
			}

			// ============================
			// 📘 Log del color detectado
			// ============================
			const logEmbed = new EmbedBuilder()
				.setTitle('🎨 Color de mensaje detectado')
				.setColor(colorDetectado)
				.setDescription(`Color leído: **#${colorDetectado.toString(16).padStart(6, '0').toUpperCase()}**`)
				.addFields(
					{ name: 'Tipo de detección', value: tipoDeteccion, inline: false },
					{ name: 'Decimal', value: `${colorDetectado}`, inline: true },
					{ name: 'Esperado (Luna de Sangre)', value: `#8E0000 (${BASE_COLOR})`, inline: true }
				)
				.setTimestamp();

			await logsChannel.send({ embeds: [logEmbed] });

			// ============================
			// 3️⃣ Comparar con color base
			// ============================
			const diff = colorDifference(BASE_COLOR, colorDetectado);

			if (diff <= COLOR_TOLERANCE) {
				await logsChannel.send(`✅ **Coincidencia por color (${tipoDeteccion})** (Δ = ${diff}). Se detectó clima de Luna de Sangre.`);

				// Enviar ping global al canal de clima
				await message.channel.send({
					content: '@everyone 🌕 **¡Luna de Sangre detectada por color!** El clima está activo, ¡prepárense para la aventura! ⚔️',
					allowedMentions: { parse: ['everyone'] },
				});
			} else {
				await logsChannel.send(`❌ **No coincide** (Δ = ${diff}). Color fuera del rango (${tipoDeteccion}).`);
			}
		} catch (err) {
			console.error('❌ Error en carnaval.js:', err);
		}
	},
};
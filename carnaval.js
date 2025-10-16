// 🎭 carnaval.js — Detección de climas basada en color (embed real o falso)
// Compatible con Discord.js v14 + mensajes reenviados de Discord

const { EmbedBuilder } = require('discord.js');

// 🧩 Configuración de canales
const CLIMA_CHANNEL_ID = '1428097401700483203';
const LOGS_CHANNEL_ID = '1428097994657497088';

// 🧩 Color base de Luna de Sangre (#8E0000)
const BASE_COLOR = 0x8E0000;

// 🧮 Rango de tolerancia RGB
const COLOR_TOLERANCE = 25;

function colorDifference(c1, c2) {
	const r1 = (c1 >> 16) & 0xff;
	const g1 = (c1 >> 8) & 0xff;
	const b1 = c1 & 0xff;
	const r2 = (c2 >> 16) & 0xff;
	const g2 = (c2 >> 8) & 0xff;
	const b2 = c2 & 0xff;
	return Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2);
}

function parseColorFromText(text) {
	const match = text.match(/#([0-9A-F]{6})/i);
	if (!match) return null;
	return parseInt(match[1], 16);
}

module.exports = {
	async handleMessage(message) {
		try {
			if (message.channel.id !== CLIMA_CHANNEL_ID) return;
			if (!message.webhookId) return;

			const logsChannel = message.guild.channels.cache.get(LOGS_CHANNEL_ID);
			if (!logsChannel) return console.warn('⚠️ Canal de logs no encontrado.');

			let colorDetectado = null;
			let tipoDeteccion = 'Ninguno';

			// 1️⃣ Intentar obtener color de embed real
			const embed = message.embeds[0];
			if (embed) {
				if (embed.color) {
					colorDetectado = embed.color;
					tipoDeteccion = 'Embed Real';
				} else if (embed.data && embed.data.color) {
					colorDetectado = embed.data.color;
					tipoDeteccion = 'Embed Reenviado (Webhook Followed)';
				}
			}

			// 2️⃣ Si no hay embed.color, buscar color en texto tipo falso embed
			if (!colorDetectado && message.content) {
				const colorFromText = parseColorFromText(message.content);
				if (colorFromText) {
					colorDetectado = colorFromText;
					tipoDeteccion = 'Texto Estilo Embed';
				}
			}

			// Si no hay color en ningún formato
			if (!colorDetectado) {
				await logsChannel.send('📭 **Mensaje sin color detectado (ni embed ni texto).**');
				return;
			}

			// Crear log visual
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

			// Comparar color con base
			const diff = colorDifference(BASE_COLOR, colorDetectado);

			if (diff <= COLOR_TOLERANCE) {
				await logsChannel.send(`✅ **Coincidencia por color (${tipoDeteccion})** (Δ = ${diff}). Se detectó clima de Luna de Sangre.`);
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
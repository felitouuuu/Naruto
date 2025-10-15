// 🎭 carnaval.js — Detección de climas con alerta por WhatsApp (Twilio)
// Requiere: discord.js v14 y twilio
// Este módulo se usa desde index.js (no crea un cliente nuevo)

const { EmbedBuilder } = require('discord.js');
const twilio = require('twilio');

// 🧩 Configuración de canales
const CLIMA_CHANNEL_ID = '1428097401700483203'; // Canal donde llegan los climas
const LOGS_CHANNEL_ID = '1428097994657497088'; // Canal de logs

// 🧩 Configuración Twilio (usa variables de entorno)
const TWILIO_SID = process.env.TWILIO_SID;        // Account SID
const TWILIO_AUTH = process.env.TWILIO_AUTH;      // Auth Token
const TWILIO_FROM = 'whatsapp:+114155238886';      // Número sandbox Twilio
const WHATSAPP_TO = 'whatsapp:+17865670033';    // Tu número de WhatsApp (reemplaza los X)

let twilioClient = null;
if (TWILIO_SID && TWILIO_AUTH) {
	twilioClient = twilio(TWILIO_SID, TWILIO_AUTH);
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

			// Buscar el canal de logs
			const logsChannel = message.guild.channels.cache.get(LOGS_CHANNEL_ID);
			if (!logsChannel) {
				console.warn('⚠️ Canal de logs no encontrado.');
				return;
			}

			// Combinar contenido + embeds (para analizar todo el texto posible)
			const texto = `${message.content} ${message.embeds
				.map(e => `${e.title || ''} ${e.description || ''}`)
				.join(' ')}`
				.toLowerCase()
				.trim();

			// Crear embed de log
			const logEmbed = new EmbedBuilder()
				.setTitle('📩 Mensaje detectado en canal de clima')
				.setColor('#FFA500')
				.setDescription(message.content || '(sin texto)')
				.addFields(
					{ name: 'Embeds detectados', value: `${message.embeds.length}`, inline: true },
					{ name: 'Texto combinado', value: texto.length > 1024 ? texto.slice(0, 1021) + '...' : texto, inline: false }
				)
				.setTimestamp();

			// Enviar log inicial
			await logsChannel.send({ embeds: [logEmbed] });

			// Detectar Luna de Sangre
			if (texto.includes('luna de sangre') || texto.includes('luna sangrienta')) {
				await logsChannel.send('✅ **Resultado:** Coincide con Luna de Sangre.');

				// Enviar ping al canal de clima
				await message.channel.send({
					content: '@everyone 🌕 **¡Luna de Sangre detectada!** El clima está activo, ¡prepárense para la aventura! ⚔️',
					allowedMentions: { parse: ['everyone'] },
				});

				// Enviar mensaje de WhatsApp si Twilio está configurado
				if (twilioClient) {
					await twilioClient.messages.create({
						from: TWILIO_FROM,
						to: WHATSAPP_TO,
						body: '🌕 ¡Luna de Sangre detectada en Discord! El clima está activo. ⚔️',
					});
					await logsChannel.send('📱 **Notificación de WhatsApp enviada correctamente.**');
				} else {
					await logsChannel.send('⚠️ **Twilio no está configurado (no se envió mensaje de WhatsApp).**');
				}
			} else {
				await logsChannel.send('❌ **Resultado:** No coincide con Luna de Sangre.');
			}
		} catch (err) {
			console.error('❌ Error en carnaval.js:', err);
		}
	},
};
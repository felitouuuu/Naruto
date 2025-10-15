// 🎭 carnaval.js — Detector de clima + alerta por WhatsApp (Twilio)

const { EmbedBuilder } = require('discord.js');
const twilio = require('twilio');

// 🧩 Configuración de canales de Discord
const CLIMA_CHANNEL_ID = '1428097401700483203'; // Canal donde llegan los climas
const LOGS_CHANNEL_ID = '1428097994657497088'; // Canal donde se mandan los logs

// 🧩 Configuración de Twilio WhatsApp Sandbox
const TWILIO_SID = process.env.TWILIO_SID;       // Desde Railway
const TWILIO_AUTH = process.env.TWILIO_AUTH;     // Desde Railway
const TWILIO_FROM = 'whatsapp:+14155238886';     // Número de Twilio Sandbox
const WHATSAPP_TO = 'whatsapp:+17865670033';     // Tu número personal (puedes cambiarlo)

// Crear cliente Twilio
let twilioClient = null;
if (TWILIO_SID && TWILIO_AUTH) {
	twilioClient = twilio(TWILIO_SID, TWILIO_AUTH);
}

module.exports = {
	/**
	 * Maneja los mensajes recibidos desde index.js
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
			if (!logsChannel) return console.warn('⚠️ Canal de logs no encontrado.');

			// Combinar contenido + embeds
			const texto = `${message.content} ${message.embeds
				.map(e => `${e.title || ''} ${e.description || ''}`)
				.join(' ')}`
				.toLowerCase()
				.trim();

			// Log visual
			const logEmbed = new EmbedBuilder()
				.setTitle('📩 Mensaje detectado en canal de clima')
				.setColor('#FFA500')
				.setDescription(message.content || '(sin texto)')
				.addFields(
					{ name: 'Embeds detectados', value: `${message.embeds.length}`, inline: true },
					{ name: 'Texto combinado', value: texto.length > 1024 ? texto.slice(0, 1021) + '...' : texto, inline: false }
				)
				.setTimestamp();

			await logsChannel.send({ embeds: [logEmbed] });

			// Detectar Luna de Sangre
			if (texto.includes('luna de sangre') || texto.includes('luna sangrienta')) {
				await logsChannel.send('✅ **Resultado:** Coincide con Luna de Sangre.');

				// Ping global en Discord
				await message.channel.send({
					content: '@everyone 🌕 **¡Luna de Sangre detectada!** El clima está activo, ¡prepárense para la aventura! ⚔️',
					allowedMentions: { parse: ['everyone'] },
				});

				// Enviar mensaje por WhatsApp
				if (twilioClient) {
					await twilioClient.messages.create({
						from: TWILIO_FROM,
						to: WHATSAPP_TO,
						body: '🌕 ¡Luna de Sangre detectada en Discord! El clima está activo. ⚔️',
					});
					await logsChannel.send('📱 **Notificación enviada a WhatsApp correctamente.**');
				} else {
					await logsChannel.send('⚠️ **Twilio no configurado: no se pudo enviar el mensaje de WhatsApp.**');
				}
			} else {
				await logsChannel.send('❌ **Resultado:** No coincide con Luna de Sangre.');
			}
		} catch (err) {
			console.error('❌ Error en carnaval.js:', err);
		}
	},
};
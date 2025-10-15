// 🎭 carnaval.js
// Módulo detector de climas para Discord.js v14
// Este archivo NO crea un cliente nuevo, se usa desde index.js

const { EmbedBuilder } = require('discord.js');

// IDs de canales configurados
const CLIMA_CHANNEL_ID = '1428097401700483203'; // Canal donde llegan los climas
const LOGS_CHANNEL_ID = '1428097994657497088'; // Canal donde se mandan los logs

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
			} else {
				await logsChannel.send('❌ **Resultado:** No coincide con Luna de Sangre.');
			}
		} catch (err) {
			console.error('❌ Error en carnaval.js:', err);
		}
	},
};
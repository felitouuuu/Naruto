// 🎭 carnaval.js — Sistema automático de clima con comando !fc
// Compatible con discord.js v14

const { EmbedBuilder } = require('discord.js');

// 🧩 Configuración
const CANAL_FC_ID = '1428097401700483203'; // Canal donde se manda !fc
const CANAL_LOG_ID = '1428097994657497088'; // Canal donde se mandan logs
const ROL_PING_ID = '1390189325244829737'; // Rol a pingear cuando hay Luna
const ID_BOT_CLIMA = null; // opcional: pon el ID del bot del clima si lo sabes

// Frases que activan el ping
const PALABRAS_CLIMA = ['luna de sangre', 'luna sangrienta'];

module.exports = {
	async handleMessage(message) {
		// Por ahora no necesitamos procesar mensajes normales aquí.
		// El sistema automático está más abajo en iniciar().
	},

	async iniciar(client) {
		const canal = await client.channels.fetch(CANAL_FC_ID).catch(() => null);
		const logs = await client.channels.fetch(CANAL_LOG_ID).catch(() => null);
		if (!canal || !logs) {
			console.error('❌ No se pudieron encontrar los canales configurados.');
			return;
		}

		console.log('🌙 Sistema de clima automático inicializado.');
		await logs.send('✅ **Sistema de clima activado.** Esperando la siguiente hora exacta...');

		// ----------------------------------------
		// 📅 Función principal que ejecuta !fc y analiza respuesta
		// ----------------------------------------
		async function verificarClima() {
			try {
				await canal.send('!fc');
				await logs.send('🕒 `!fc` enviado — esperando respuesta del bot del clima...');

				// Esperar mensajes del bot del clima durante 15s
				const collector = canal.createMessageCollector({
					filter: m => m.author.bot && (!ID_BOT_CLIMA || m.author.id === ID_BOT_CLIMA),
					time: 15000,
				});

				let detectado = false;

				collector.on('collect', async msg => {
					const texto = `${msg.content} ${msg.embeds
						.map(e => `${e.title || ''} ${e.description || ''}`)
						.join(' ')}`.toLowerCase();

					if (PALABRAS_CLIMA.some(p => texto.includes(p))) {
						detectado = true;
						await logs.send('🌕 **Luna de Sangre detectada.**');
						await canal.send({
							content: `<@&${ROL_PING_ID}> 🌕 **¡Luna de Sangre detectada!** El clima está activo.`,
							allowedMentions: { parse: ['roles'] },
						});
						collector.stop();
					}
				});

				collector.on('end', async collected => {
					if (!detectado) {
						await logs.send(
							collected.size === 0
								? '⚠️ No hubo respuesta del bot del clima.'
								: '❌ Clima normal, sin Luna de Sangre.'
						);
					}
				});
			} catch (err) {
				console.error('Error en verificación de clima:', err);
				await logs.send(`❌ Error verificando clima: ${err.message}`);
			}
		}

		// ----------------------------------------
		// ⏰ Programar ejecución cada hora exacta
		// ----------------------------------------
		function programarCadaHoraExacta() {
			const ahora = new Date();
			const siguienteHora = new Date(ahora);
			siguienteHora.setMinutes(0, 0, 0); // limpiar minutos y segundos
			siguienteHora.setHours(ahora.getHours() + 1); // próxima hora redonda
			const msHastaProxima = siguienteHora - ahora;

			setTimeout(() => {
				verificarClima(); // ejecutar al llegar la hora
				setInterval(verificarClima, 60 * 60 * 1000); // repetir cada 1 hora exacta
			}, msHastaProxima);

			console.log(
				`⏰ Próxima ejecución programada para las ${siguienteHora.toLocaleTimeString()}.`
			);
			logs.send(
				`🕐 Próxima ejecución programada para **${siguienteHora.toLocaleTimeString()}**.`
			);
		}

		programarCadaHoraExacta();
	},
};
// carnaval.js — Sistema automatico de clima con comando !fc (a las HH:02)
const { EmbedBuilder } = require('discord.js');

const CANAL_FC_ID = '1428222747670220882'; // Canal donde se manda !fc
const CANAL_LOG_ID = '1428222848182517810'; // Canal donde se mandan logs
const ROL_PING_ID = '1390189325244829737'; // Rol a pingear cuando hay Luna
const ID_BOT_CLIMA = null; // Opcional: ID del bot del clima
const PALABRAS_CLIMA = ['luna de sangre', 'luna sangrienta'];

module.exports = {
  async handleMessage() {
    // No se usa para eventos directos
  },

  async iniciar(client) {
    const canal = await client.channels.fetch(CANAL_FC_ID).catch(() => null);
    const logs = await client.channels.fetch(CANAL_LOG_ID).catch(() => null);
    if (!canal || !logs) {
      console.error('No se pudieron encontrar los canales configurados.');
      return;
    }

    console.log('Sistema de clima automatico inicializado.');
    await logs.send('Sistema de clima activado. Esperando la siguiente ejecucion (HH:02)...');

    // Funcion principal
    async function verificarClima() {
      try {
        await canal.send('<@429457053791158281> fc');
        await logs.send(`Comando !fc enviado a las ${new Date().toLocaleTimeString()} — esperando respuesta...`);

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
            await logs.send('Luna de Sangre detectada.');
            await canal.send({
              content: `<@&${ROL_PING_ID}> Luna de Sangre detectada. El clima esta activo.`,
              allowedMentions: { parse: ['roles'] },
            });
            collector.stop();
          }
        });

        collector.on('end', async collected => {
          if (!detectado) {
            await logs.send(
              collected.size === 0
                ? 'No hubo respuesta del bot del clima.'
                : 'Clima normal, sin Luna de Sangre.'
            );
          }
        });
      } catch (err) {
        console.error('Error en verificacion de clima:', err);
        await logs.send(`Error verificando clima: ${err.message}`);
      }
    }

    // Programar ejecucion cada hora a las HH:02
    function programarCadaHoraMas02() {
      const ahora = new Date();
      const siguienteHora = new Date(ahora);
      siguienteHora.setMinutes(2, 0, 0); // Minuto 02 exacto
      if (ahora.getMinutes() >= 2) {
        // Si ya paso el minuto 02, saltar a la proxima hora
        siguienteHora.setHours(ahora.getHours() + 1);
      }
      const msHastaProxima = siguienteHora - ahora;

      setTimeout(() => {
        verificarClima();
        setInterval(verificarClima, 60 * 60 * 1000);
      }, msHastaProxima);

      console.log(`Proxima ejecucion: ${siguienteHora.toLocaleTimeString()}`);
      logs.send(`Proxima ejecucion programada para ${siguienteHora.toLocaleTimeString()} (HH:02).`);
    }

    programarCadaHoraMas02();
  },
};
module.exports = {
	name: 'testr',
	description: 'Envía un test de reinicio (anuncio de encendido).',
	executeMessage: async (msg) => {
		if (msg.client.channels.cache.get) {
			const CANAL_ID = '1401680611810476082';
			const ROL_ID = '1390189325244829737';
			const ch = msg.client.channels.cache.get(CANAL_ID);
			if (ch) ch.send(`<@&${ROL_ID}> ✅ Test reinicio enviado.`);
		}
		await msg.reply('Test reinicio enviado.');
	},
	executeInteraction: async (interaction) => {
		await interaction.reply('Test reinicio enviado.');
	}
};

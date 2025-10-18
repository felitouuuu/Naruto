module.exports = {
	name: 'testr',
	description: 'Envía un test de reinicio (anuncio de encendido).',
	syntax: '!testr',
	executeMessage: async (msg) => {
		const CANAL_ID = '1401680611810476082';
		const ROL_ID = '1390189325244829737';

		const ch = msg.client.channels.cache.get(CANAL_ID) || await msg.client.channels.fetch(CANAL_ID).catch(() => null);
		if (ch) await ch.send(`<@&${ROL_ID}> ✅ Test reinicio exitoso.`).catch(() => {});

		await msg.reply('Test reinicio enviado.');
	},
	executeInteraction: async (interaction) => {
		const CANAL_ID = '1401680611810476082';
		const ROL_ID = '1390189325244829737';

		const ch = interaction.client.channels.cache.get(CANAL_ID) || await interaction.client.channels.fetch(CANAL_ID).catch(() => null);
		if (ch) await ch.send(`<@&${ROL_ID}> ✅ Test reinicio exitoso.`).catch(() => {});

		await interaction.reply({ content: 'Test reinicio enviado.', ephemeral: true });
	}
};
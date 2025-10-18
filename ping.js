const { EmbedBuilder } = require('discord.js');

module.exports = {
	name: 'ping',
	description: 'Muestra latencia del bot.',
	syntax: '!ping',
	executeMessage: async (msg) => {
		const sent = await msg.channel.send('Calculando información...').catch(() => null);
		const latencyMessage = sent ? (sent.createdTimestamp - msg.createdTimestamp) : 'N/A';
		const latencyAPI = Math.round(msg.client.ws.ping);

		const embed = new EmbedBuilder()
			.setTitle('🎃🏓 Info del bot')
			.setColor('#8B0000')
			.setDescription('Datos del bot — ¡mira bajo la luz de la luna!')
			.addFields(
				{ name: 'API (latencia)', value: `${latencyAPI} ms`, inline: true },
				{ name: 'Mi Ping', value: `${latencyMessage} ms`, inline: true }
			)
			.setFooter({ text: '🦇 Comando: !ping' })
			.setTimestamp();

		if (sent) await sent.edit({ content: '', embeds: [embed] }).catch(() => msg.channel.send({ embeds: [embed] }));
		else msg.channel.send({ embeds: [embed] });
	},
	executeInteraction: async (interaction) => {
		const sent = await interaction.channel.send('Calculando información...').catch(() => null);
		const latencyMessage = sent ? (sent.createdTimestamp - interaction.createdTimestamp) : 'N/A';
		const latencyAPI = Math.round(interaction.client.ws.ping);

		const embed = new EmbedBuilder()
			.setTitle('🎃🏓 Info del bot')
			.setColor('#8B0000')
			.setDescription('Datos del bot — ¡mira bajo la luz de la luna!')
			.addFields(
				{ name: 'API (latencia)', value: `${latencyAPI} ms`, inline: true },
				{ name: 'Mi Ping', value: `${latencyMessage} ms`, inline: true }
			)
			.setFooter({ text: '🦇 Comando: /ping' })
			.setTimestamp();

		if (sent) await sent.edit({ content: '', embeds: [embed] }).catch(() => interaction.reply({ embeds: [embed] }));
		else interaction.reply({ embeds: [embed] });
	}
};
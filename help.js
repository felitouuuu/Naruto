const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
	name: 'help',
	description: 'Muestra el mensaje de ayuda.',
	executeMessage: async (msg, args) => {
		const commands = msg.client.commands;
		const sub = args[0];
		if (sub && commands.has(sub)) {
			const cmd = commands.get(sub);
			const embed = new EmbedBuilder()
				.setTitle(`Comando: ${msg.client.PREFIX}${cmd.name}`)
				.setDescription(cmd.description)
				.addFields({ name: 'Ejemplo de uso', value: `\`${cmd.name === 'setprefix' ? msg.client.PREFIX + 'setprefix ?' : msg.client.PREFIX + cmd.name}\`` });
			return msg.channel.send({ embeds: [embed] });
		}

		const helpEmbed = new EmbedBuilder()
			.setTitle('📖 Comandos disponibles')
			.setDescription('Lista de comandos disponibles:')
			.setColor('#6A0DAD');

		commands.forEach(c => helpEmbed.addFields({ name: `${msg.client.PREFIX}${c.name}`, value: c.description, inline: false }));

		const row = new ActionRowBuilder()
			.addComponents(new ButtonBuilder()
				.setCustomId('help_next')
				.setLabel('Siguiente sección')
				.setStyle(ButtonStyle.Primary));

		await msg.channel.send({ embeds: [helpEmbed], components: [row] });
	},
	executeInteraction: async (interaction) => {
		const commands = interaction.client.commands;

		const helpEmbed = new EmbedBuilder()
			.setTitle('📖 Comandos disponibles (/)')
			.setDescription('Lista de comandos disponibles con slash:')
			.setColor('#6A0DAD');

		commands.forEach(c => helpEmbed.addFields({ name: `/${c.name}`, value: c.description, inline: false }));

		const row = new ActionRowBuilder()
			.addComponents(new ButtonBuilder()
				.setCustomId('help_next')
				.setLabel('Siguiente sección')
				.setStyle(ButtonStyle.Primary));

		await interaction.reply({ embeds: [helpEmbed], components: [row] });
	}
};

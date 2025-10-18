module.exports = {
	name: 'setprefix',
	description: 'Cambia el prefijo de comandos.',
	executeMessage: async (msg, args) => {
		const newPrefix = args[0];
		if (!newPrefix) return msg.reply('Debes especificar un prefijo.');
		msg.client.PREFIX = newPrefix;
		await msg.reply(`Prefijo actualizado a: \`${newPrefix}\``);
	},
	executeInteraction: async (interaction) => {
		const newPrefix = interaction.options.getString('prefix');
		interaction.client.PREFIX = newPrefix;
		await interaction.reply(`Prefijo actualizado a: \`${newPrefix}\``);
	}
};

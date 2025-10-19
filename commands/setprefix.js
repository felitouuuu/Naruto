const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    name: 'setprefix',
    ejemplo: 'setprefix <prefix>, setprefix, setprefix ?',
    categoria: 'Configuracion',
    description: 'Configura el prefix a utilizar en este servidor.',
    syntax: '<prefix_actual> [comando] <nuevo_prefix>',
    data: new SlashCommandBuilder()
        .setName('setprefix')
        .setDescription('Cambia el prefijo de comandos.')
        .addStringOption(option =>
            option.setName('prefix')
                  .setDescription('El nuevo prefijo que deseas establecer')
                  .setRequired(true)
        ),

    executeMessage: async (msg, args) => {
        const newPrefix = args[0];
        if (!newPrefix) return msg.reply('Debes especificar un prefijo.');
        msg.client.PREFIX = newPrefix;
        await msg.reply(`Prefijo actualizado a: \`${newPrefix}\``);
    },

    executeInteraction: async (interaction) => {
        const newPrefix = interaction.options.getString('prefix');
        if (!newPrefix) return interaction.reply({ content: 'Debes especificar un prefijo.', ephemeral: true });
        interaction.client.PREFIX = newPrefix;
        await interaction.reply(`Prefijo actualizado a: \`${newPrefix}\``);
    }
};
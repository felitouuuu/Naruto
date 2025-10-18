const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, SlashCommandBuilder } = require('discord.js');

const CATEGORIES = {
    Configuración: ['setprefix'],
    Información: ['ping', 'testr', 'help']
};

const CATEGORY_EMOJIS = {
    Configuración: '⚙️',
    Información: 'ℹ️'
};

module.exports = {
    name: 'help',
    description: 'Muestra el mensaje de ayuda.',
    syntax: '!help <comando/categoría>',
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Muestra el menú de ayuda')
        .addStringOption(option =>
            option.setName('filtro')
                  .setDescription('Filtro opcional')
                  .setRequired(false)
        ),

    executeMessage: async (msg, args) => {
        return sendGeneralHelp(msg);
    },

    executeInteraction: async (interaction) => {
        return sendGeneralHelp(interaction, true);
    },

    handleInteraction: async (interaction) => {
        const client = interaction.client;

        if (interaction.isStringSelectMenu()) {
            if (interaction.customId === 'help_category') {
                const catName = interaction.values[0];
                return sendCategoryEmbed(interaction, catName, true);
            } else if (interaction.customId === 'help_command') {
                const cmdName = interaction.values[0];
                const cmd = client.commands.get(cmdName);
                if (!cmd) return;
                const embed = new EmbedBuilder()
                    .setTitle(`Comando: /${cmd.name}`)
                    .setDescription(cmd.description)
                    .setFooter({ text: `Sintaxis: /${cmd.name}` })
                    .setColor('#6A0DAD');
                await interaction.reply({ embeds: [embed], ephemeral: true });
            }
        }

        if (interaction.isButton() && interaction.customId === 'help_close') {
            await interaction.message.delete().catch(() => {});
            if (!interaction.replied && !interaction.deferred) await interaction.deferUpdate().catch(() => {});
        }
    }
};

// ------------------ FUNCIONES AUXILIARES ------------------

function sendGeneralHelp(target, slash = false) {
    const client = target.client;
    const commands = client.commands;

    const embed = new EmbedBuilder()
        .setTitle(`${slash ? '/' : '!'}help — Menú de ayuda`)
        .setDescription(`Cantidad de categorías: ${Object.keys(CATEGORIES).length}\nCantidad de comandos: ${commands.size}`)
        .setColor('#6A0DAD');

    const rowCategories = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('help_category')
            .setPlaceholder('Selecciona una categoría')
            .addOptions(Object.keys(CATEGORIES).map(cat => ({
                label: cat,
                value: cat,
                description: `Ver comandos de ${cat}`,
                emoji: CATEGORY_EMOJIS[cat]
            })))
    );

    const rowCommands = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('help_command')
            .setPlaceholder('Selecciona un comando')
            .addOptions(Array.from(commands.values()).map(cmd => ({
                label: cmd.name,
                value: cmd.name,
                description: cmd.description || 'Sin descripción'
            })))
    );

    const closeButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('help_close').setLabel('Cerrar').setStyle(ButtonStyle.Danger)
    );

    if (slash) return target.reply({ embeds: [embed], components: [rowCategories, rowCommands, closeButton], ephemeral: true });
    else return target.channel.send({ embeds: [embed], components: [rowCategories, rowCommands, closeButton] });
}

function sendCategoryEmbed(target, catName, slash = false) {
    const client = target.client;
    const embed = new EmbedBuilder()
        .setTitle(`${CATEGORY_EMOJIS[catName]} ${catName} — Comandos`)
        .setDescription(`Listado de comandos en la categoría ${catName}:`)
        .setColor('#6A0DAD');

    CATEGORIES[catName].forEach(cName => {
        const cmd = client.commands.get(cName);
        embed.addFields({ name: `\`${slash ? '/' : '!'}${cmd.name}\``, value: cmd.description || 'Sin descripción', inline: false });
    });

    const closeButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('help_close').setLabel('Cerrar').setStyle(ButtonStyle.Danger)
    );

    if (slash) return target.reply({ embeds: [embed], components: [closeButton], ephemeral: true });
    else return target.channel.send({ embeds: [embed], components: [closeButton] });
}
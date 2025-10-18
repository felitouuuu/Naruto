const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');

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
    executeMessage: async (msg, args) => {
        const commands = msg.client.commands;
        const prefix = msg.client.PREFIX;

        // Guardamos las categorías en el cliente para el menú interactivo
        msg.client.commands.categories = CATEGORIES;

        // 1️⃣ Caso: !help <comando>
        if (args[0] && commands.has(args[0])) {
            const cmd = commands.get(args[0]);
            const embed = new EmbedBuilder()
                .setTitle(`Comando: ${prefix}${cmd.name}`)
                .setDescription(cmd.description)
                .addFields(
                    { name: 'Sintaxis', value: cmd.syntax || `${prefix}${cmd.name}` },
                    { name: 'Ejemplos', value: `\`${prefix}help\`\n\`${prefix}${cmd.name}\`` }
                )
                .setColor('#6A0DAD')
                .setTimestamp();
            return msg.channel.send({ embeds: [embed] });
        }

        // 2️⃣ Caso: !help <categoría>
        if (args[0] && Object.keys(CATEGORIES).map(c => c.toLowerCase()).includes(args[0].toLowerCase())) {
            const catName = Object.keys(CATEGORIES).find(c => c.toLowerCase() === args[0].toLowerCase());
            return sendCategoryEmbed(msg, catName);
        }

        // 3️⃣ Caso: !help general
        return sendGeneralHelp(msg);
    }
};

// Función para enviar el embed general
function sendGeneralHelp(msg) {
    const commands = msg.client.commands;
    const prefix = msg.client.PREFIX;

    const helpEmbed = new EmbedBuilder()
        .setTitle('📖 Menú de ayuda')
        .setDescription(`Cantidad de categorías: ${Object.keys(CATEGORIES).length}\nCantidad de comandos: ${commands.size}`)
        .setColor('#6A0DAD');

    for (const cat in CATEGORIES) {
        const cmds = CATEGORIES[cat].map(cName => `\`${prefix}${cName}\``).join(', ');
        helpEmbed.addFields({
            name: `${CATEGORY_EMOJIS[cat]} ${cat}`,
            value: cmds || 'No hay comandos',
            inline: false
        });
    }

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('help_category')
        .setPlaceholder('Selecciona una Categoría')
        .addOptions(Object.keys(CATEGORIES).map(cat => ({
            label: cat,
            value: cat,
            description: `Ver comandos de ${cat}`,
            emoji: CATEGORY_EMOJIS[cat]
        })));

    const rowMenu = new ActionRowBuilder().addComponents(selectMenu);
    const closeButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('help_close').setLabel('Cerrar').setStyle(ButtonStyle.Danger)
    );

    return msg.channel.send({ embeds: [helpEmbed], components: [rowMenu, closeButton] });
}

// Función para enviar embed de una categoría específica
function sendCategoryEmbed(msg, catName) {
    const commands = msg.client.commands;
    const prefix = msg.client.PREFIX;

    const embed = new EmbedBuilder()
        .setTitle(`${CATEGORY_EMOJIS[catName]} ${catName} — Comandos`)
        .setDescription(`Listado de comandos en la categoría ${catName}:`)
        .setColor('#6A0DAD');

    CATEGORIES[catName].forEach(cName => {
        const cmd = commands.get(cName);
        embed.addFields({ name: `\`${prefix}${cmd.name}\``, value: cmd.description || 'No hay descripción', inline: false });
    });

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('help_category')
        .setPlaceholder('Selecciona una Categoría')
        .addOptions(Object.keys(CATEGORIES).map(cat => ({
            label: cat,
            value: cat,
            description: `Ver comandos de ${cat}`,
            emoji: CATEGORY_EMOJIS[cat]
        })));

    const rowMenu = new ActionRowBuilder().addComponents(selectMenu);
    const closeButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('help_close').setLabel('Cerrar').setStyle(ButtonStyle.Danger)
    );

    return msg.channel.send({ embeds: [embed], components: [rowMenu, closeButton] });
}

// Función para manejar interacciones (menú y botón)
module.exports.handleInteraction = async (interaction) => {
    const client = interaction.client;
    const prefix = client.PREFIX;

    // Menú de categorías
    if (interaction.isStringSelectMenu() && interaction.customId === 'help_category') {
        const catName = interaction.values[0];
        if (!catName) return;

        const embed = new EmbedBuilder()
            .setTitle(`${CATEGORY_EMOJIS[catName]} ${catName} — Comandos`)
            .setDescription(`Listado de comandos en la categoría ${catName}:`)
            .setColor('#6A0DAD');

        CATEGORIES[catName].forEach(cName => {
            const cmd = client.commands.get(cName);
            embed.addFields({ name: `\`${prefix}${cmd.name}\``, value: cmd.description || 'No hay descripción', inline: false });
        });

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('help_category')
            .setPlaceholder('Selecciona una Categoría')
            .addOptions(Object.keys(CATEGORIES).map(cat => ({
                label: cat,
                value: cat,
                description: `Ver comandos de ${cat}`,
                emoji: CATEGORY_EMOJIS[cat]
            })));

        const rowMenu = new ActionRowBuilder().addComponents(selectMenu);
        const closeButton = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('help_close').setLabel('Cerrar').setStyle(ButtonStyle.Danger)
        );

        return interaction.update({ embeds: [embed], components: [rowMenu, closeButton] });
    }

    // Botón rojo X para cerrar
    if (interaction.isButton() && interaction.customId === 'help_close') {
        await interaction.message.delete().catch(() => {});
        if (!interaction.replied && !interaction.deferred) {
            await interaction.deferUpdate().catch(() => {});
        }
    }
};
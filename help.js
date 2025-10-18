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
        msg.client.commands.categories = CATEGORIES;

        // 1️⃣ Caso: !help <comando>
        if (args[0] && commands.has(args[0])) {
            const cmd = commands.get(args[0]);
            const embed = new EmbedBuilder()
                .setTitle(`Comando: ${prefix}${cmd.name}`)
                .setDescription(cmd.description)
                .addFields(
                    { name: 'Ejemplos', value: `\`${prefix}help\`\n\`${prefix}${cmd.name}\`` }
                )
                .setColor('#6A0DAD')
                .setFooter({ text: `Sintaxis: ${cmd.syntax || `${prefix}${cmd.name}`}` })
                .setTimestamp();
            return msg.channel.send({ embeds: [embed] });
        }

        // 2️⃣ Caso: !help <categoría>
        if (args[0] && Object.keys(CATEGORIES).map(c => c.toLowerCase()).includes(args[0].toLowerCase())) {
            const catName = Object.keys(CATEGORIES).find(c => c.toLowerCase() === args[0].toLowerCase());
            return sendCategoryEmbed(msg, catName);
        }

        // 3️⃣ Caso: !help general o /help
        return sendGeneralHelp(msg);
    },

    executeInteraction: async (interaction) => {
        const commands = interaction.client.commands;
        const prefix = interaction.client.PREFIX;
        interaction.client.commands.categories = CATEGORIES;

        // Slash /help
        if (interaction.isChatInputCommand()) {
            const filter = interaction.options.getString('filtro') || null;
            if (filter && commands.has(filter)) {
                const cmd = commands.get(filter);
                const embed = new EmbedBuilder()
                    .setTitle(`Comando: /${cmd.name}`)
                    .setDescription(cmd.description)
                    .addFields(
                        { name: 'Ejemplos', value: `/help\n/${cmd.name}` }
                    )
                    .setColor('#6A0DAD')
                    .setFooter({ text: `Sintaxis: /${cmd.name}` })
                    .setTimestamp();
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }
            return sendGeneralHelp(interaction, true); // true indica que es slash
        }
    },

    handleInteraction: async (interaction) => {
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
            if (!interaction.replied && !interaction.deferred) await interaction.deferUpdate().catch(() => {});
        }
    }
};

// --- Funciones auxiliares ---
function sendGeneralHelp(target, isSlash = false) {
    const prefix = target.client.PREFIX;

    const embed = new EmbedBuilder()
        .setTitle(isSlash ? '📖 Menú de ayuda (/help)' : '📖 Menú de ayuda (!help)')
        .setDescription('Selecciona una categoría para ver los comandos disponibles:')
        .setColor('#6A0DAD');

    // Mostrar categorías solo, con backticks y emoji
    for (const cat in CATEGORIES) {
        embed.addFields({
            name: `\`${isSlash ? '/help ' : '!help '}${cat.toLowerCase()}\` ${CATEGORY_EMOJIS[cat]}`,
            value: ' ',
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

    if (target.isCommand && isSlash) {
        return target.reply({ embeds: [embed], components: [rowMenu, closeButton], ephemeral: true });
    } else {
        return target.channel.send({ embeds: [embed], components: [rowMenu, closeButton] });
    }
}

function sendCategoryEmbed(msg, catName) {
    const prefix = msg.client.PREFIX;

    const embed = new EmbedBuilder()
        .setTitle(`${CATEGORY_EMOJIS[catName]} ${catName} — Comandos`)
        .setDescription(`Listado de comandos en la categoría ${catName}:`)
        .setColor('#6A0DAD');

    CATEGORIES[catName].forEach(cName => {
        const cmd = msg.client.commands.get(cName);
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
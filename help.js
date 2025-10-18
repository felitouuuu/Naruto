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
    data: {
        name: 'help',
        description: 'Muestra el mensaje de ayuda',
        options: [
            {
                name: 'filtro',
                type: 3, // STRING
                description: 'Especifica un comando o categoría',
                required: false,
                choices: [
                    { name: 'Configuración', value: 'Configuración' },
                    { name: 'Información', value: 'Información' },
                    { name: 'ping', value: 'ping' },
                    { name: 'testr', value: 'testr' },
                    { name: 'help', value: 'help' },
                    { name: 'setprefix', value: 'setprefix' },
                ]
            }
        ]
    },

    // ------------------ PREFIJO ------------------
    executeMessage: async (msg, args) => {
        const commands = msg.client.commands;
        const prefix = msg.client.PREFIX;

        if (args[0] && commands.has(args[0])) {
            // Caso comando específico
            const cmd = commands.get(args[0]);
            const embed = new EmbedBuilder()
                .setTitle(`Comando: ${prefix}${cmd.name}`)
                .setDescription(cmd.description)
                .addFields(
                    { name: 'Ejemplos', value: `\`${prefix}help\`\n\`${prefix}${cmd.name}\`` }
                )
                .setFooter({ text: `Sintaxis: ${cmd.syntax || `${prefix}${cmd.name}`}` })
                .setColor('#6A0DAD')
                .setTimestamp();
            return msg.channel.send({ embeds: [embed] });
        }

        if (args[0] && Object.keys(CATEGORIES).map(c => c.toLowerCase()).includes(args[0].toLowerCase())) {
            const catName = Object.keys(CATEGORIES).find(c => c.toLowerCase() === args[0].toLowerCase());
            return sendCategoryEmbed(msg, catName);
        }

        // Help general
        return sendGeneralHelp(msg);
    },

    // ------------------ SLASH ------------------
    executeInteraction: async (interaction) => {
        const commands = interaction.client.commands;
        const prefix = interaction.client.PREFIX;
        const filtro = interaction.options.getString('filtro');

        if (filtro && commands.has(filtro.toLowerCase())) {
            const cmd = commands.get(filtro.toLowerCase());
            const embed = new EmbedBuilder()
                .setTitle(`Comando: /${cmd.name}`)
                .setDescription(cmd.description)
                .addFields({ name: 'Ejemplos', value: `/help\n/${cmd.name}` })
                .setFooter({ text: `Sintaxis: /${cmd.name}` })
                .setColor('#6A0DAD')
                .setTimestamp();
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (filtro && Object.keys(CATEGORIES).map(c => c.toLowerCase()).includes(filtro.toLowerCase())) {
            const catName = Object.keys(CATEGORIES).find(c => c.toLowerCase() === filtro.toLowerCase());
            return sendCategoryEmbed(interaction, catName, true);
        }

        return sendGeneralHelp(interaction, true);
    },

    handleInteraction: async (interaction) => {
        const client = interaction.client;
        const prefix = client.PREFIX;

        // Menú desplegable
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

            const rowMenu = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('help_category')
                    .setPlaceholder('Selecciona una Categoría')
                    .addOptions(Object.keys(CATEGORIES).map(cat => ({
                        label: cat,
                        value: cat,
                        description: `Ver comandos de ${cat}`,
                        emoji: CATEGORY_EMOJIS[cat]
                    })))
            );

            const closeButton = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('help_close').setLabel('Cerrar').setStyle(ButtonStyle.Danger)
            );

            return interaction.update({ embeds: [embed], components: [rowMenu, closeButton] });
        }

        // Botón cerrar
        if (interaction.isButton() && interaction.customId === 'help_close') {
            await interaction.message.delete().catch(() => {});
            if (!interaction.replied && !interaction.deferred) await interaction.deferUpdate().catch(() => {});
        }
    }
};

// ------------------ FUNCIONES AUXILIARES ------------------

function sendGeneralHelp(target, slash = false) {
    const client = target.client;
    const prefix = client.PREFIX;
    const commands = client.commands;

    const helpEmbed = new EmbedBuilder()
        .setTitle(`${slash ? '/' : '!'}help — Menú de ayuda`)
        .setDescription(`Cantidad de categorías: ${Object.keys(CATEGORIES).length}\nCantidad de comandos: ${commands.size}`)
        .setColor('#6A0DAD');

    for (const cat in CATEGORIES) {
        helpEmbed.addFields({
            name: `${CATEGORY_EMOJIS[cat]} ${cat}`,
            value: `\`${slash ? '/' : '!'}help ${cat}\``,
            inline: false
        });
    }

    const rowMenu = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('help_category')
            .setPlaceholder('Selecciona una Categoría')
            .addOptions(Object.keys(CATEGORIES).map(cat => ({
                label: cat,
                value: cat,
                description: `Ver comandos de ${cat}`,
                emoji: CATEGORY_EMOJIS[cat]
            })))
    );

    const closeButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('help_close').setLabel('Cerrar').setStyle(ButtonStyle.Danger)
    );

    if (slash) return target.reply({ embeds: [helpEmbed], components: [rowMenu, closeButton], ephemeral: true });
    else return target.channel.send({ embeds: [helpEmbed], components: [rowMenu, closeButton] });
}

function sendCategoryEmbed(target, catName, slash = false) {
    const client = target.client;
    const prefix = client.PREFIX;

    const embed = new EmbedBuilder()
        .setTitle(`${CATEGORY_EMOJIS[catName]} ${catName} — Comandos`)
        .setDescription(`Listado de comandos en la categoría ${catName}:`)
        .setColor('#6A0DAD');

    CATEGORIES[catName].forEach(cName => {
        const cmd = client.commands.get(cName);
        embed.addFields({ name: `\`${slash ? '/' : '!'}${cmd.name}\``, value: cmd.description || 'No hay descripción', inline: false });
    });

    const rowMenu = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('help_category')
            .setPlaceholder('Selecciona una Categoría')
            .addOptions(Object.keys(CATEGORIES).map(cat => ({
                label: cat,
                value: cat,
                description: `Ver comandos de ${cat}`,
                emoji: CATEGORY_EMOJIS[cat]
            })))
    );

    const closeButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('help_close').setLabel('Cerrar').setStyle(ButtonStyle.Danger)
    );

    if (slash) return target.reply({ embeds: [embed], components: [rowMenu, closeButton], ephemeral: true });
    else return target.channel.send({ embeds: [embed], components: [rowMenu, closeButton] });
}
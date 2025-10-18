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
        .setDescription('Muestra el mensaje de ayuda')
        .addStringOption(option =>
            option.setName('categoria')
                .setDescription('Filtra por categoría')
                .setRequired(false)
                .addChoices(
                    { name: 'Configuración', value: 'Configuración' },
                    { name: 'Información', value: 'Información' }
                )
        )
        .addStringOption(option =>
            option.setName('comando')
                .setDescription('Filtra por comando')
                .setRequired(false)
                .addChoices(
                    { name: 'ping', value: 'ping' },
                    { name: 'testr', value: 'testr' },
                    { name: 'help', value: 'help' },
                    { name: 'setprefix', value: 'setprefix' }
                )
        ),

    // ------------------ PREFIJO ------------------
    executeMessage: async (msg, args) => {
        const commands = msg.client.commands;
        const prefix = msg.client.PREFIX;

        if (args[0] && commands.has(args[0])) {
            const cmd = commands.get(args[0]);
            return msg.channel.send({
                embeds: [new EmbedBuilder()
                    .setTitle(`Comando: ${prefix}${cmd.name}`)
                    .setDescription(cmd.description)
                    .addFields({ name: 'Ejemplo', value: `\`${prefix}${cmd.name}\`` })
                    .setFooter({ text: `Sintaxis: ${cmd.syntax || `${prefix}${cmd.name}`}` })
                    .setColor('#6A0DAD')
                    .setTimestamp()
                ]
            });
        }

        if (args[0] && Object.keys(CATEGORIES).map(c => c.toLowerCase()).includes(args[0].toLowerCase())) {
            const catName = Object.keys(CATEGORIES).find(c => c.toLowerCase() === args[0].toLowerCase());
            return sendCategoryEmbed(msg, catName);
        }

        return sendGeneralHelp(msg);
    },

    // ------------------ SLASH ------------------
    executeInteraction: async (interaction) => {
        const commands = interaction.client.commands;
        const prefix = interaction.client.PREFIX;

        const cat = interaction.options.getString('categoria');
        const cmdOpt = interaction.options.getString('comando');

        if (cmdOpt && commands.has(cmdOpt)) {
            const cmd = commands.get(cmdOpt);
            return interaction.reply({
                embeds: [new EmbedBuilder()
                    .setTitle(`Comando: /${cmd.name}`)
                    .setDescription(cmd.description)
                    .addFields({ name: 'Ejemplo', value: `/${cmd.name}` })
                    .setFooter({ text: `Sintaxis: /${cmd.name}` })
                    .setColor('#6A0DAD')
                    .setTimestamp()
                ],
                ephemeral: true
            });
        }

        if (cat && Object.keys(CATEGORIES).includes(cat)) {
            return sendCategoryEmbed(interaction, cat, true);
        }

        return sendGeneralHelp(interaction, true);
    },

    // ------------------ MENÚ Y BOTÓN ------------------
    handleInteraction: async (interaction) => {
        if (interaction.isStringSelectMenu() && interaction.customId === 'help_category') {
            const catName = interaction.values[0];
            if (!catName) return;
            return sendCategoryEmbed(interaction, catName, interaction.isCommand());
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
    const prefix = client.PREFIX;

    const embed = new EmbedBuilder()
        .setTitle(`${slash ? '/' : '!'}help — Menú de ayuda`)
        .setDescription(`Cantidad de categorías: ${Object.keys(CATEGORIES).length}\nCantidad de comandos: ${client.commands.size}`)
        .setColor('#6A0DAD');

    for (const cat in CATEGORIES) {
        embed.addFields({ name: `${CATEGORY_EMOJIS[cat]} ${cat}`, value: `\`${slash ? '/' : '!'}help ${cat}\``, inline: false });
    }

    const row = new ActionRowBuilder().addComponents(
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

    if (slash) return target.reply({ embeds: [embed], components: [row, closeButton], ephemeral: true });
    else return target.channel.send({ embeds: [embed], components: [row, closeButton] });
}

function sendCategoryEmbed(target, catName, slash = false) {
    const client = target.client;

    const embed = new EmbedBuilder()
        .setTitle(`${CATEGORY_EMOJIS[catName]} ${catName} — Comandos`)
        .setDescription(`Listado de comandos en la categoría ${catName}:`)
        .setColor('#6A0DAD');

    CATEGORIES[catName].forEach(cName => {
        const cmd = client.commands.get(cName);
        embed.addFields({ name: `\`${slash ? '/' : '!'}${cmd.name}\``, value: cmd.description || 'No hay descripción', inline: false });
    });

    const row = new ActionRowBuilder().addComponents(
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

    if (slash) return target.reply({ embeds: [embed], components: [row, closeButton], ephemeral: true });
    else return target.channel.send({ embeds: [embed], components: [row, closeButton] });
}
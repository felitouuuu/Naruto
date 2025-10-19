const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  SlashCommandBuilder
} = require('discord.js');

const OWNER_ID = '1003512479277662208';
const TEST_GUILD_ID = '1390187634093199461';

const CATEGORIES = {
  Configuración: ['setprefix'],
  Información: ['ping', 'help'],
  Administrador: ['testr']
};

const CATEGORY_EMOJIS = {
  Configuración: '⚙️',
  Información: 'ℹ️',
  Administrador: '🛠️'
};

module.exports = {
  name: 'help',
  description: 'Muestra la lista de comandos y categorías o información sobre uno específico.',
  syntax: '!help <comando/categoría>',
  color: '#6A0DAD',

  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Muestra la lista de comandos o información sobre uno específico.')
    .addStringOption(opt =>
      opt.setName('categoria')
        .setDescription('Filtra por categoría')
        .setRequired(false)
        .addChoices(
          { name: 'Configuración', value: 'Configuración' },
          { name: 'Información', value: 'Información' }
        )
    )
    .addStringOption(opt =>
      opt.setName('comando')
        .setDescription('Filtra por comando')
        .setRequired(false)
        .addChoices(
          { name: 'ping', value: 'ping' },
          { name: 'help', value: 'help' },
          { name: 'setprefix', value: 'setprefix' }
        )
    ),

  executeMessage: async (msg, args) => {
    const prefix = msg.client.getPrefix(msg.guild?.id);
    const commands = msg.client.commands;
    const isOwner = msg.author.id === OWNER_ID && msg.guild?.id === TEST_GUILD_ID;

    // Buscar comando
    if (args[0] && commands.has(args[0])) {
      const cmd = commands.get(args[0]);
      if (cmd.categoria === 'Administrador' && !isOwner) return msg.reply('❌ Ese comando no existe.');
      return msg.channel.send({ embeds: [createCommandEmbed(cmd, prefix)] });
    }

    // Buscar categoría
    if (args[0] && Object.keys(CATEGORIES).map(c => c.toLowerCase()).includes(args[0].toLowerCase())) {
      const catName = Object.keys(CATEGORIES).find(c => c.toLowerCase() === args[0].toLowerCase());
      if (catName === 'Administrador' && !isOwner) return msg.reply('❌ Esa categoría no existe.');
      return sendCategoryEmbed(msg, catName, false, prefix, isOwner);
    }

    return sendGeneralHelp(msg, false, prefix, isOwner);
  },

  executeInteraction: async (interaction) => {
    const commands = interaction.client.commands;
    const prefix = interaction.client.getPrefix(interaction.guild?.id);
    const isOwner = interaction.user.id === OWNER_ID && interaction.guild?.id === TEST_GUILD_ID;

    const cat = interaction.options.getString('categoria');
    const cmdOpt = interaction.options.getString('comando');

    if (cmdOpt && commands.has(cmdOpt)) {
      const cmd = commands.get(cmdOpt);
      if (cmd.categoria === 'Administrador' && !isOwner)
        return interaction.reply({ content: '❌ Ese comando no existe.', ephemeral: true });

      return interaction.reply({ embeds: [createCommandEmbed(cmd, '/')], ephemeral: false });
    }

    if (cat && Object.keys(CATEGORIES).includes(cat)) {
      if (cat === 'Administrador' && !isOwner)
        return interaction.reply({ content: '❌ Esa categoría no existe.', ephemeral: true });
      return sendCategoryEmbed(interaction, cat, true, prefix, isOwner);
    }

    return sendGeneralHelp(interaction, true, prefix, isOwner);
  },

  handleInteraction: async (interaction) => {
    if (interaction.isStringSelectMenu() && interaction.customId === 'help_category') {
      const catName = interaction.values[0];
      const isSlash = !!(interaction.message?.interaction && interaction.message.interaction.commandName === 'help');
      const prefix = interaction.client.getPrefix(interaction.guild?.id);
      const isOwner = interaction.user.id === OWNER_ID && interaction.guild?.id === TEST_GUILD_ID;
      const embed = await createCategoryEmbed(interaction, catName, isSlash, prefix, isOwner);
      const components = buildComponents(isOwner);
      return interaction.update({ embeds: [embed], components });
    }

    if (interaction.isButton() && interaction.customId === 'help_close') {
      await interaction.message.delete().catch(() => {});
      if (!interaction.replied && !interaction.deferred) await interaction.deferUpdate().catch(() => {});
    }
  }
};

// 🔹 Embed de comando
function createCommandEmbed(cmd, prefix) {
  const ejemplos = cmd.ejemplos
    ? cmd.ejemplos.map(e => `\`${prefix}${e}\``).join('\n')
    : `\`${prefix}${cmd.name}\``;

  return new EmbedBuilder()
    .setTitle(`Comando: ${prefix}${cmd.name}`)
    .setDescription(cmd.description || 'Sin descripción.')
    .addFields(
      { name: 'Categoría', value: `${cmd.categoria} ${cmd.categoriaEmoji || ''}`, inline: false },
      { name: 'Ejemplo(s)', value: ejemplos, inline: false },
      { name: 'Sintaxis', value: cmd.syntax || '<requerido> [opcional]', inline: false }
    )
    .setColor(cmd.color || '#6A0DAD')
    .setTimestamp();
}

// 🔹 Embed general de ayuda
async function sendGeneralHelp(target, slash = false, prefix = '!', isOwner = false) {
  const visibleCategories = isOwner ? Object.keys(CATEGORIES) : Object.keys(CATEGORIES).filter(c => c !== 'Administrador');
  const visibleCommands = visibleCategories.reduce((acc, c) => acc + CATEGORIES[c].length, 0);

  const embed = new EmbedBuilder()
    .setTitle(`${slash ? '/' : prefix}help — Menú de ayuda`)
    .setDescription(
      `Categorías: **${visibleCategories.length}**\nComandos: **${visibleCommands}**\n\nSelecciona una categoría para ver sus comandos.`
    )
    .setColor('#6A0DAD');

  for (const cat of visibleCategories) {
    embed.addFields({
      name: `${CATEGORY_EMOJIS[cat]} ${cat}`,
      value: `\`${slash ? '/' : prefix}help ${cat}\``,
      inline: false
    });
  }

  const components = buildComponents(isOwner);
  if (slash && target.reply) return target.reply({ embeds: [embed], components, ephemeral: false });
  else if (!slash && target.channel) return target.channel.send({ embeds: [embed], components });
}

// 🔹 Embed de categoría
async function sendCategoryEmbed(target, catName, slash = false, prefix = '!', isOwner = false) {
  const embed = await createCategoryEmbed(target, catName, slash, prefix, isOwner);
  const components = buildComponents(isOwner);
  if (slash) return target.reply({ embeds: [embed], components, ephemeral: false }).catch(() => {});
  else return target.channel.send({ embeds: [embed], components });
}

// 🔹 Menú desplegable y botón
function buildComponents(isOwner = false) {
  const options = Object.keys(CATEGORIES)
    .filter(cat => isOwner || cat !== 'Administrador')
    .map(cat => ({
      label: cat,
      value: cat,
      description: `Ver comandos de ${cat}`,
      emoji: CATEGORY_EMOJIS[cat]
    }));

  const select = new StringSelectMenuBuilder()
    .setCustomId('help_category')
    .setPlaceholder('Selecciona una categoría')
    .addOptions(options);

  const rowSelect = new ActionRowBuilder().addComponents(select);
  const closeButton = new ButtonBuilder()
    .setCustomId('help_close')
    .setLabel('Cerrar')
    .setStyle(ButtonStyle.Danger);

  const rowClose = new ActionRowBuilder().addComponents(closeButton);
  return [rowSelect, rowClose];
}

// 🔹 Embed de categoría con lista de comandos
async function createCategoryEmbed(context, catName, slash = false, prefix = '!', isOwner = false) {
  if (catName === 'Administrador' && !isOwner)
    return new EmbedBuilder().setDescription('❌ Esa categoría no existe.');

  const client = context.client;
  const embed = new EmbedBuilder()
    .setTitle(`${CATEGORY_EMOJIS[catName]} ${catName} — Comandos`)
    .setDescription(`Listado de comandos en la categoría ${catName}:`)
    .setColor('#6A0DAD');

  for (const cName of CATEGORIES[catName]) {
    const cmd = client.commands.get(cName);
    if (!cmd) continue;

    const commandLabel = slash ? `/${cmd.name}` : `${prefix}${cmd.name}`;
    embed.addFields({
      name: commandLabel,
      value: cmd.description || 'Sin descripción.',
      inline: false
    });
  }

  return embed;
}

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
  Administrador: '🔒'
};

module.exports = {
  name: 'help',
  description: 'Muestra la lista de comandos y categorías o información sobre uno específico.',
  syntax: '!help <comando/categoría>',
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Muestra la lista de comandos y categorías o información sobre uno específico')
    .addStringOption(opt =>
      opt.setName('categoria')
        .setDescription('Filtra por categoría')
        .setRequired(false)
        .addChoices(
          { name: 'Configuración', value: 'Configuración' },
          { name: 'Información', value: 'Información' },
          { name: 'Administrador', value: 'Administrador' }
        )
    )
    .addStringOption(opt =>
      opt.setName('comando')
        .setDescription('Filtra por comando')
        .setRequired(false)
    ),

  executeMessage: async (msg, args) => {
    const commands = msg.client.commands;
    const prefix = msg.client.getPrefix(msg.guild?.id);

    if (args[0] && commands.has(args[0])) {
      const cmd = commands.get(args[0]);
      return msg.channel.send({ embeds: [createCommandEmbed(cmd, prefix, msg.author.id, msg.guild?.id)] });
    }

    if (args[0] && Object.keys(CATEGORIES).map(c => c.toLowerCase()).includes(args[0].toLowerCase())) {
      const catName = Object.keys(CATEGORIES).find(c => c.toLowerCase() === args[0].toLowerCase());
      return sendCategoryEmbed(msg, catName, false, msg.author.id, msg.guild?.id);
    }

    return sendGeneralHelp(msg, false, msg.author.id, msg.guild?.id);
  },

  executeInteraction: async (interaction) => {
    const commands = interaction.client.commands;
    const cat = interaction.options.getString('categoria');
    const cmdOpt = interaction.options.getString('comando');
    const userId = interaction.user.id;
    const guildId = interaction.guild?.id;

    if (cmdOpt && commands.has(cmdOpt)) {
      const cmd = commands.get(cmdOpt);
      return interaction.reply({ embeds: [createCommandEmbed(cmd, '/', userId, guildId)], ephemeral: false });
    }

    if (cat && Object.keys(CATEGORIES).includes(cat)) {
      return sendCategoryEmbed(interaction, cat, true, userId, guildId);
    }

    return sendGeneralHelp(interaction, true, userId, guildId);
  },

  handleInteraction: async (interaction) => {
    if (interaction.isStringSelectMenu() && interaction.customId === 'help_category') {
      const catName = interaction.values[0];
      if (!catName) return;
      const userId = interaction.user.id;
      const guildId = interaction.guild?.id;
      const isSlashContext = !!(interaction.message?.interaction && interaction.message.interaction.commandName === 'help');
      const embed = await createCategoryEmbed(interaction, catName, isSlashContext, userId, guildId);
      const components = buildComponents(userId, guildId);
      return interaction.update({ embeds: [embed], components });
    }

    if (interaction.isButton() && interaction.customId === 'help_close') {
      await interaction.message.delete().catch(() => {});
      if (!interaction.replied && !interaction.deferred) await interaction.deferUpdate().catch(() => {});
    }
  }
};

function canSeeAdmin(userId, guildId) {
  return userId === OWNER_ID && guildId === TEST_GUILD_ID;
}

function createCommandEmbed(cmd, prefix, userId, guildId) {
  if (cmd.name === 'testr' && !canSeeAdmin(userId, guildId)) {
    return new EmbedBuilder()
      .setColor('#6A0DAD')
      .setDescription('❌ Ese comando no existe o no tienes permiso para verlo.');
  }

  return new EmbedBuilder()
    .setColor('#6A0DAD')
    .setTitle(`Comando: ${prefix}${cmd.name}`)
    .setDescription(cmd.description || 'Sin descripción.')
    .addFields(
      { name: 'Categoría', value: `${cmd.categoria || 'Desconocida'} ${CATEGORY_EMOJIS[cmd.categoria] || ''}` },
      { name: 'Ejemplo(s)', value: cmd.ejemplo ? `\`${prefix}${cmd.ejemplo}\`` : 'Sin ejemplos' },
      { name: 'Sintaxis', value: cmd.syntax || 'Sin sintaxis' }
    )
    .setTimestamp();
}

async function sendGeneralHelp(target, slash = false, userId, guildId) {
  const client = target.client;
  const visibleCategories = Object.keys(CATEGORIES).filter(c => c !== 'Administrador' || canSeeAdmin(userId, guildId));

  const embed = new EmbedBuilder()
    .setColor('#6A0DAD')
    .setTitle(`${slash ? '/' : client.getPrefix(guildId)}help — Menú de ayuda`)
    .setDescription(
      `Categorías: **${visibleCategories.length}**\nComandos: **${client.commands.size}**\n\nSelecciona una categoría para ver sus comandos.`
    );

  for (const cat of visibleCategories) {
    const helpCall = `\`${slash ? '/' : client.getPrefix(guildId)}help ${cat}\``;
    embed.addFields({ name: `${CATEGORY_EMOJIS[cat]} ${cat}`, value: helpCall, inline: false });
  }

  const components = buildComponents(userId, guildId);
  if (slash && target.reply) return target.reply({ embeds: [embed], components, ephemeral: false });
  else if (!slash && target.channel) return target.channel.send({ embeds: [embed], components });
  else return null;
}

async function sendCategoryEmbed(target, catName, slash = false, userId, guildId) {
  const embed = await createCategoryEmbed(target, catName, slash, userId, guildId);
  const components = buildComponents(userId, guildId);
  if (slash && target.reply) return target.reply({ embeds: [embed], components, ephemeral: false }).catch(() => {});
  else return target.channel.send({ embeds: [embed], components });
}

function buildComponents(userId, guildId) {
  const visibleCategories = Object.keys(CATEGORIES).filter(c => c !== 'Administrador' || canSeeAdmin(userId, guildId));

  const select = new StringSelectMenuBuilder()
    .setCustomId('help_category')
    .setPlaceholder('Selecciona una categoría')
    .addOptions(visibleCategories.map(cat => ({
      label: cat,
      value: cat,
      description: `Ver comandos de ${cat}`,
      emoji: CATEGORY_EMOJIS[cat]
    })));

  const rowSelect = new ActionRowBuilder().addComponents(select);
  const closeButton = new ButtonBuilder().setCustomId('help_close').setLabel('Cerrar').setStyle(ButtonStyle.Danger);
  const rowClose = new ActionRowBuilder().addComponents(closeButton);

  return [rowSelect, rowClose];
}

async function createCategoryEmbed(context, catName, slash, userId, guildId) {
  const client = context.client;
  const embed = new EmbedBuilder()
    .setColor('#6A0DAD')
    .setTitle(`${CATEGORY_EMOJIS[catName]} ${catName} — Comandos`)
    .setDescription(`Listado de comandos en la categoría ${catName}:`);

  for (const cName of CATEGORIES[catName]) {
    const cmd = client.commands.get(cName);
    if (!cmd) continue;
    if (cmd.name === 'testr' && !canSeeAdmin(userId, guildId)) continue;

    embed.addFields({
      name: slash ? `/${cmd.name}` : `${client.getPrefix(guildId)}${cmd.name}`,
      value: cmd.description || 'Sin descripción',
      inline: false
    });
  }

  return embed;
}

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  SlashCommandBuilder
} = require('discord.js');

const CATEGORIES = {
  'Configuración': ['setprefix'],
  'Información': ['ping', 'help', 'prefix'],
  'Criptos': ['crypto', 'convert', 'listvalue', 'valueset', 'valuesettings', 'valuestop'],
  'Developer': ['dbstatus']
};

const CATEGORY_EMOJIS = {
  'Configuración': '⚙️',
  'Información': 'ℹ️',
  'Criptos': '🪙',
  'Developer': '🛠️',
};

// Owner + server para mostrar Developer
const DEV_OWNER_ID = '1003512479277662208';
const DEV_GUILD_ID = '1390187634093199461';

module.exports = {
  name: 'help',
  description: 'Muestra la lista de comandos y categorías o información sobre uno específico.',
  ejemplo: 'help\nhelp (comando)\nhelp setprefix',
  syntax: '<prefix_actual> (comando) <comando/categoría>',

  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Muestra la lista de comandos y categorías o información sobre uno específico')
    .addStringOption(o =>
      o.setName('categoria')
        .setDescription('Filtra por categoría')
        .setRequired(false)
        .addChoices(
          { name: 'Configuración', value: 'Configuración' },
          { name: 'Información', value: 'Información' },
          { name: 'Criptos', value: 'Criptos' },
          { name: 'Developer', value: 'Developer' }
        )
    )
    .addStringOption(o =>
      o.setName('comando')
        .setDescription('Filtra por comando')
        .setRequired(false)
        .addChoices(
          { name: 'ping', value: 'ping' },
          { name: 'help', value: 'help' },
          { name: 'setprefix', value: 'setprefix' },
          { name: 'prefix', value: 'prefix' },
          { name: 'crypto', value: 'crypto' },
          { name: 'listvalue', value: 'listvalue' },
          { name: 'valueset', value: 'valueset' },
          { name: 'valuestop', value: 'valuestop' },
          { name: 'valuesettings', value: 'valuesettings' },
          { name: 'dbstatus', value: 'dbstatus' },
          { name: 'convert', value: 'convert' }
        )
    ),

  executeMessage: async (msg, args) => {
    const client = msg.client;
    const guildId = msg.guild?.id;
    const authorId = msg.author?.id;
    const prefix = client.getPrefix?.(guildId) || '!';
    const [first] = args || [];
    const commands = client.commands;

    const visibleCats = getVisibleCategories(guildId, authorId);

    if (first && commands.has(first)) {
      const cmd = commands.get(first);
      // If command is in Developer but user cannot see Developer, ignore
      const cat = getCommandCategory(first);
      if (cat === 'Developer' && !isDevVisible(guildId, authorId)) return;
      const embed = buildCommandDetailsEmbed(cmd, prefix, false, first);
      return msg.channel.send({ embeds: [embed] });
    }

    if (first && isCategoryName(first)) {
      const catName = normalizeCategory(first);
      if (!visibleCats.includes(catName)) return; // not visible to this user
      return sendCategoryEmbed(msg, catName, false);
    }

    return sendGeneralHelp(msg, false, visibleCats);
  },

  executeInteraction: async (interaction) => {
    const client = interaction.client;
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const commands = client.commands;
    const cat = interaction.options.getString('categoria');
    const cmdOpt = interaction.options.getString('comando');

    const visibleCats = getVisibleCategories(guildId, userId);

    if (cmdOpt && commands.has(cmdOpt)) {
      const cmd = commands.get(cmdOpt);
      const catName = getCommandCategory(cmdOpt);
      if (catName === 'Developer' && !isDevVisible(guildId, userId)) {
        return interaction.reply({ content: 'Comando no disponible.', ephemeral: true });
      }
      const embed = buildCommandDetailsEmbed(cmd, '/', true, cmdOpt);
      return interaction.reply({ embeds: [embed], ephemeral: false });
    }

    if (cat && isCategoryName(cat)) {
      const catName = normalizeCategory(cat);
      if (!visibleCats.includes(catName)) return interaction.reply({ content: 'Categoría no disponible.', ephemeral: true });
      return sendCategoryEmbed(interaction, catName, true);
    }

    return sendGeneralHelp(interaction, true, visibleCats);
  },

  handleInteraction: async (interaction) => {
    if (interaction.isStringSelectMenu() && interaction.customId === 'help_category') {
      const catName = interaction.values[0];
      if (!catName) return;

      // check visibility
      if (!getVisibleCategories(interaction.guildId, interaction.user.id).includes(catName)) {
        return interaction.update({ content: 'Categoría no disponible.', components: [], embeds: [] }).catch(() => {});
      }

      const isSlash = Boolean(
        interaction.message?.interaction &&
        interaction.message.interaction.commandName === 'help'
      );

      const embed = await createCategoryEmbed(interaction, catName, isSlash);
      const components = buildComponents(isSlash, interaction.guildId, interaction.user.id);

      return interaction.update({ embeds: [embed], components });
    }

    if (interaction.isButton() && interaction.customId === 'help_close') {
      await interaction.message.delete().catch(() => {});
      if (!interaction.replied && !interaction.deferred) await interaction.deferUpdate().catch(() => {});
    }
  }
};

function isDevVisible(guildId, userId) {
  return String(guildId) === DEV_GUILD_ID && String(userId) === DEV_OWNER_ID;
}

function getVisibleCategories(guildId, userId) {
  const cats = Object.keys(CATEGORIES);
  return cats.filter(c => {
    if (c === 'Developer') return isDevVisible(guildId, userId);
    return true;
  });
}

function isCategoryName(str) {
  return Object.keys(CATEGORIES).some(c => c.toLowerCase() === str.toLowerCase());
}
function normalizeCategory(str) {
  return Object.keys(CATEGORIES).find(c => c.toLowerCase() === str.toLowerCase());
}

function getCommandCategory(cmdName) {
  for (const [cat, cmds] of Object.entries(CATEGORIES)) {
    if (cmds.includes(cmdName)) return cat;
  }
  return 'Información';
}

function buildCommandDetailsEmbed(cmd, prefixOrSlash, isSlash, cmdName) {
  const prefix = prefixOrSlash;
  const ejemplos = (cmd.ejemplo || '')
    .split('\n').map(e => e.trim()).filter(Boolean)
    .map(line => `${prefix}${line}`);

  const catName = getCommandCategory(cmdName);
  const catEmoji = CATEGORY_EMOJIS[catName] || '📁';

  const embed = new EmbedBuilder()
    .setTitle(`Comando: ${prefix}${cmd.name}`)
    .setDescription(cmd.description || 'Sin descripción.')
    .addFields(
      { name: 'Categoría', value: `${catName} ${catEmoji}`, inline: false },
      { name: 'Ejemplo(s)', value: '```\n' + (ejemplos.length ? ejemplos.join('\n') : `${prefix}${cmd.name}`) + '\n```', inline: false },
      { name: 'Sintaxis', value: cmd.syntax ? `\`${cmd.syntax}\`` : `\`${prefix}${cmd.name}\``, inline: false },
    )
    .setColor('#6A0DAD')
    .setTimestamp();

  return embed;
}

async function sendGeneralHelp(target, slash = false, visibleCats = Object.keys(CATEGORIES)) {
  const client = target.client;
  const prefix = client.getPrefix?.(target.guild?.id || target.guildId) || '!';
  const visible = visibleCats;
  const publicCmdCount = visible.reduce((acc, cat) => acc + CATEGORIES[cat].length, 0);

  const embed = new EmbedBuilder()
    .setTitle(`${slash ? '/' : prefix}help — Menú de ayuda`)
    .setDescription(
      `Categorías: **${visible.length}**\n` +
      `Comandos: **${publicCmdCount}**\n\n` +
      `Selecciona una categoría para ver sus comandos.`
    )
    .setColor('#6A0DAD');

  for (const cat of visible) {
    const call = `\`${slash ? '/' : prefix}help ${cat}\``;
    embed.addFields({ name: `${CATEGORY_EMOJIS[cat]} ${cat}`, value: call, inline: false });
  }

  const components = buildComponents(slash, target.guild?.id || target.guildId, target.user?.id || (target.author && target.author.id));
  if (slash && target.reply) return target.reply({ embeds: [embed], components, ephemeral: false });
  if (!slash && target.channel) return target.channel.send({ embeds: [embed], components });
}

async function sendCategoryEmbed(target, catName, slash = false) {
  const embed = await createCategoryEmbed(target, catName, slash);
  const components = buildComponents(slash, target.guild?.id || target.guildId, target.user?.id || (target.author && target.author.id));
  if (slash) {
    if (target.reply) return target.reply({ embeds: [embed], components, ephemeral: false }).catch(async () => { try { await target.update({ embeds: [embed], components }); } catch {} });
    return target.channel.send({ embeds: [embed], components });
  } else {
    return target.channel.send({ embeds: [embed], components });
  }
}

function buildComponents(slash, guildId, userId) {
  const visible = getVisibleCategories(guildId, userId);
  const options = visible.map(cat => ({
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

async function createCategoryEmbed(context, catName, slash = false) {
  const client = context.client;
  const prefix = client.getPrefix?.(context.guild?.id || context.guildId) || '!';

  const embed = new EmbedBuilder()
    .setTitle(`${CATEGORY_EMOJIS[catName]} ${catName} — Comandos`)
    .setDescription(`Listado de comandos en la categoría ${catName}:`)
    .setColor('#6A0DAD');

  let appCmds = new Map();
  if (slash) {
    try {
      const globalCmds = await client.application.commands.fetch().catch(() => new Map());
      const guildCmds = await client.application.commands.fetch({ guildId: context.guildId }).catch(() => new Map());
      appCmds = new Map([...globalCmds, ...guildCmds]);
    } catch { appCmds = new Map(); }
  }

  for (const cName of CATEGORIES[catName]) {
    const cmd = client.commands.get(cName);
    if (!cmd) continue;

    // If developer category, only show when allowed (caller already filtered lists, but double-check)
    if (catName === 'Developer' && !isDevVisible(context.guildId, (context.user && context.user.id) || (context.author && context.author.id))) continue;

    if (slash) {
      const app = [...appCmds.values()].find(x => x.name === cmd.name);
      const title = app ? `</${cmd.name}:${app.id}>` : `/${cmd.name}`;
      embed.addFields({ name: title, value: cmd.description || 'Sin descripción', inline: false });
    } else {
      embed.addFields({ name: `${prefix}${cmd.name}`, value: cmd.description || 'Sin descripción', inline: false });
    }
  }

  return embed;
}
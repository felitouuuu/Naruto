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
  'Criptos': ['crypto', 'listvalue', 'valueset', 'valuesettings', 'valuestop'],
  'Developer': ['dbstatus']
};

const CATEGORY_EMOJIS = {
  'Configuración': '⚙️',
  'Información': 'ℹ️',
  'Criptos': '🪙',
  'Developer': '🛠️',
};

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
          { name: 'dbstatus', value: 'dbstatus' }
        )
    ),

  // ============================
  // HELP POR PREFIJO
  // ============================
  executeMessage: async (msg, args) => {
    const client = msg.client;
    const guildId = msg.guild?.id;
    const prefix = client.getPrefix?.(guildId) || '!';

    const [first] = args || [];
    const commands = client.commands;

    if (first && commands.has(first)) {
      const cmd = commands.get(first);
      const embed = buildCommandDetailsEmbed(cmd, prefix, false, first);
      return msg.channel.send({ embeds: [embed] });
    }

    if (first && isCategoryName(first)) {
      const cat = normalizeCategory(first);
      return sendCategoryEmbed(msg, cat, false);
    }

    return sendGeneralHelp(msg, false);
  },

  // ============================
  // HELP POR COMANDO SLASH
  // ============================
  executeInteraction: async (interaction) => {
    const client = interaction.client;
    const commands = client.commands;

    const cat = interaction.options.getString('categoria');
    const cmdOpt = interaction.options.getString('comando');

    if (cmdOpt && commands.has(cmdOpt)) {
      const cmd = commands.get(cmdOpt);
      const embed = buildCommandDetailsEmbed(cmd, '/', true, cmdOpt);
      return interaction.reply({ embeds: [embed], ephemeral: false });
    }

    if (cat && isCategoryName(cat)) {
      return sendCategoryEmbed(interaction, cat, true);
    }

    return sendGeneralHelp(interaction, true);
  },

  handleInteraction: async (interaction) => {
    if (interaction.isStringSelectMenu() && interaction.customId === 'help_category') {
      const catName = interaction.values[0];
      if (!catName) return;

      const isSlash = Boolean(
        interaction.message?.interaction &&
        interaction.message.interaction.commandName === 'help'
      );

      const embed = await createCategoryEmbed(interaction, catName, isSlash);
      const components = buildComponents(isSlash);

      return interaction.update({ embeds: [embed], components });
    }

    if (interaction.isButton() && interaction.customId === 'help_close') {
      await interaction.message.delete().catch(() => {});
      if (!interaction.replied && !interaction.deferred)
        await interaction.deferUpdate().catch(() => {});
    }
  }
};

// ----------------------------------

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

// -----------------------

function buildCommandDetailsEmbed(cmd, prefixOrSlash, isSlash, cmdName) {
  const prefix = prefixOrSlash;

  const ejemplos = (cmd.ejemplo || '')
    .split('\n')
    .map(e => e.trim())
    .filter(Boolean)
    .map(line => `${prefix}${line}`);

  const catName = getCommandCategory(cmdName);
  const emoji = CATEGORY_EMOJIS[catName] || '📁';

  return new EmbedBuilder()
    .setTitle(`Comando: ${prefix}${cmd.name}`)
    .setDescription(cmd.description || 'Sin descripción.')
    .addFields(
      { name: 'Categoría', value: `${catName} ${emoji}` },
      { name: 'Ejemplo(s)', value: '```\n' + ejemplos.join('\n') + '\n```' },
      { name: 'Sintaxis', value: cmd.syntax ? `\`${cmd.syntax}\`` : `\`${prefix}${cmd.name}\`` }
    )
    .setColor('#6A0DAD');
}

// -----------------------

async function sendGeneralHelp(target, slash) {
  const client = target.client;
  const prefix = client.getPrefix?.(target.guild?.id || target.guildId) || '!';

  const visibleCats = Object.keys(CATEGORIES);
  const total = visibleCats.reduce((acc, c) => acc + CATEGORIES[c].length, 0);

  const embed = new EmbedBuilder()
    .setTitle(`${slash ? '/' : prefix}help — Menú de ayuda`)
    .setDescription(
      `Categorías: **${visibleCats.length}**\n` +
      `Comandos: **${total}**\n\n` +
      `Selecciona una categoría para ver sus comandos.`
    )
    .setColor('#6A0DAD');

  for (const cat of visibleCats) {
    embed.addFields({
      name: `${CATEGORY_EMOJIS[cat]} ${cat}`,
      value: `\`${slash ? '/' : prefix}help ${cat}\``
    });
  }

  const components = buildComponents(slash);

  if (slash) return target.reply({ embeds: [embed], components });
  return target.channel.send({ embeds: [embed], components });
}

// -----------------------

async function sendCategoryEmbed(target, catName, slash) {
  const embed = await createCategoryEmbed(target, catName, slash);
  const components = buildComponents(slash);

  if (slash) return target.reply({ embeds: [embed], components });
  return target.channel.send({ embeds: [embed], components });
}

// -----------------------

function buildComponents(slash) {
  const opts = Object.keys(CATEGORIES).map(cat => ({
    label: cat,
    value: cat,
    description: `Ver comandos de ${cat}`,
    emoji: CATEGORY_EMOJIS[cat]
  }));

  const menu = new StringSelectMenuBuilder()
    .setCustomId('help_category')
    .addOptions(opts)
    .setPlaceholder('Selecciona una categoría');

  return [
    new ActionRowBuilder().addComponents(menu),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('help_close')
        .setLabel('Cerrar')
        .setStyle(ButtonStyle.Danger)
    )
  ];
}

// -----------------------

async function createCategoryEmbed(context, catName, slash) {
  const client = context.client;
  const prefix = client.getPrefix?.(context.guild?.id || context.guildId) || '!';

  const embed = new EmbedBuilder()
    .setTitle(`${CATEGORY_EMOJIS[catName]} ${catName} — Comandos`)
    .setDescription(`Listado de comandos:`)
    .setColor('#6A0DAD');

  let slashCmds = new Map();

  if (slash) {
    try {
      const global = await client.application.commands.fetch().catch(() => new Map());
      const guild = await client.application.commands.fetch({ guildId: context.guildId }).catch(() => new Map());
      slashCmds = new Map([...global, ...guild]);
    } catch {}
  }

  for (const cName of CATEGORIES[catName]) {
    const cmd = client.commands.get(cName);
    if (!cmd) continue;

    if (slash) {
      const app = [...slashCmds.values()].find(x => x.name === cmd.name);
      embed.addFields({
        name: app ? `</${cmd.name}:${app.id}>` : `/${cmd.name}`,
        value: cmd.description
      });
    } else {
      embed.addFields({
        name: `${prefix}${cmd.name}`,
        value: cmd.description
      });
    }
  }

  return embed;
}
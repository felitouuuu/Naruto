const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  SlashCommandBuilder
} = require('discord.js');

// ===============================
// CONFIGURACIÓN PRINCIPAL
// ===============================
const OWNER_ID = '1003512479277662208';
const TEST_GUILD_ID = '1390187634093199461';

const CATEGORIES = {
  'Configuración': ['setprefix'],
  'Información': ['ping', 'help'],
  'Administrador': ['testr'],
};

const CATEGORY_EMOJIS = {
  'Configuración': '⚙️',
  'Información': 'ℹ️',
  'Administrador': '🛠️',
};

// ===============================
// MÓDULO PRINCIPAL
// ===============================
module.exports = {
  name: 'help',
  description: 'Muestra la lista de comandos y categorías o información sobre uno específico.',
  ejemplo: 'help\nhelp (comando)\nhelp setprefix',
  syntax: '!help <comando/categoría>',

  // -------------------------------
  // Slash Command Definition
  // -------------------------------
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
          { name: 'Administrador', value: 'Administrador' } // <- agregado para servidor de prueba
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
          { name: 'testr', value: 'testr' } // <- visible para owner en server de prueba
        )
    ),

  // -------------------------------
  // Prefijo (!help)
  // -------------------------------
  executeMessage: async (msg, args) => {
    const client = msg.client;
    const prefix = client.getPrefix?.(msg.guild?.id) || '!';
    const [first] = args || [];
    const commands = client.commands;

    if (first && commands.has(first)) {
      const cmd = commands.get(first);
      const embed = buildCommandDetailsEmbed(cmd, prefix, false);
      return msg.channel.send({ embeds: [embed] });
    }

    if (first && isCategoryName(first)) {
      const cat = normalizeCategory(first);
      return sendCategoryEmbed(msg, cat, false);
    }

    return sendGeneralHelp(msg, false);
  },

  // -------------------------------
  // Slash (/help)
  // -------------------------------
  executeInteraction: async (interaction) => {
    const client = interaction.client;
    const commands = client.commands;
    const cat = interaction.options.getString('categoria');
    const cmdOpt = interaction.options.getString('comando');

    if (cmdOpt && commands.has(cmdOpt)) {
      const cmd = commands.get(cmdOpt);
      const embed = buildCommandDetailsEmbed(cmd, '/', true);
      return interaction.reply({ embeds: [embed], ephemeral: false });
    }

    if (cat && isCategoryName(cat)) {
      return sendCategoryEmbed(interaction, cat, true);
    }

    return sendGeneralHelp(interaction, true);
  },

  // -------------------------------
  // Interacciones (menú + botón)
  // -------------------------------
  handleInteraction: async (interaction) => {
    if (interaction.isStringSelectMenu() && interaction.customId === 'help_category') {
      const catName = interaction.values[0];
      if (!catName) return;
      const isSlashContext = Boolean(interaction.message?.interaction && interaction.message.interaction.commandName === 'help');
      const embed = await createCategoryEmbed(interaction, catName, isSlashContext);
      const components = buildComponents(interaction, isSlashContext);
      return interaction.update({ embeds: [embed], components });
    }

    if (interaction.isButton() && interaction.customId === 'help_close') {
      await interaction.message.delete().catch(() => {});
      if (!interaction.replied && !interaction.deferred) await interaction.deferUpdate().catch(() => {});
    }
  }
};

// ===============================
// FUNCIONES AUXILIARES
// ===============================
function isOwnerHere(ctx) {
  const userId = ctx.user?.id || ctx.author?.id;
  const guildId = ctx.guild?.id || ctx.guildId;
  return userId === OWNER_ID && guildId === TEST_GUILD_ID;
}

function isCategoryName(str) {
  return Object.keys(CATEGORIES).some(c => c.toLowerCase() === str.toLowerCase());
}

function normalizeCategory(str) {
  return Object.keys(CATEGORIES).find(c => c.toLowerCase() === str.toLowerCase());
}

// ===============================
// EMBEDS DE DETALLE
// ===============================
function buildCommandDetailsEmbed(cmd, prefixOrSlash, isSlash) {
  const prefix = prefixOrSlash;
  const ejemplos = (cmd.ejemplo || '')
    .split('\n').map(e => e.trim()).filter(Boolean)
    .map(line => `${prefix}${line}`);

  const catName = readableCategory(cmd.categoria);
  const catEmoji = CATEGORY_EMOJIS[catName] || '📁';

  const embed = new EmbedBuilder()
    .setTitle(`Comando: ${prefix}${cmd.name}`)
    .setDescription(cmd.description || 'Sin descripción.')
    .addFields(
      { name: 'Categoría', value: `${catName} ${catEmoji}`, inline: false },
      { name: 'Ejemplo(s)', value: '```\n' + ejemplos.join('\n') + '\n```', inline: false },
      { name: 'Sintaxis', value: cmd.syntax ? `\`${cmd.syntax}\`` : `\`${prefix}${cmd.name}\``, inline: false },
    )
    .setColor('#6A0DAD')
    .setTimestamp();

  return embed;
}

function readableCategory(raw) {
  switch ((raw || '').toLowerCase()) {
    case 'configuracion': return 'Configuración';
    case 'informacion': return 'Información';
    case 'administrador': return 'Administrador';
    default: return 'Información';
  }
}

// ===============================
// HELP GENERAL
// ===============================
async function sendGeneralHelp(target, slash = false) {
  const client = target.client;
  const prefix = client.getPrefix?.(target.guild?.id || target.guildId) || '!';
  const showAdmin = isOwnerHere(target);
  const visibleCats = Object.keys(CATEGORIES).filter(c => (c !== 'Administrador') || showAdmin);
  const publicCmdCount = visibleCats.reduce((acc, cat) => acc + CATEGORIES[cat].length, 0);

  const embed = new EmbedBuilder()
    .setTitle(`${slash ? '/' : prefix}help — Menú de ayuda`)
    .setDescription(
      `Categorías: **${visibleCats.length}**\n` +
      `Comandos: **${publicCmdCount}**\n\n` +
      `Selecciona una categoría para ver sus comandos.`
    )
    .setColor('#6A0DAD');

  for (const cat of visibleCats) {
    const call = `\`${slash ? '/' : prefix}help ${cat}\``;
    embed.addFields({ name: `${CATEGORY_EMOJIS[cat]} ${cat}`, value: call, inline: false });
  }

  const components = buildComponents(target, slash);
  if (slash && target.reply) return target.reply({ embeds: [embed], components, ephemeral: false });
  if (!slash && target.channel) return target.channel.send({ embeds: [embed], components });
}

// ===============================
// HELP POR CATEGORÍA
// ===============================
async function sendCategoryEmbed(target, catName, slash = false) {
  const embed = await createCategoryEmbed(target, catName, slash);
  const components = buildComponents(target, slash);

  if (slash) {
    if (target.reply) return target.reply({ embeds: [embed], components, ephemeral: false })
      .catch(async () => { try { await target.update({ embeds: [embed], components }); } catch {} });
    return target.channel.send({ embeds: [embed], components });
  } else {
    return target.channel.send({ embeds: [embed], components });
  }
}

// ===============================
// COMPONENTES (select + botón)
// ===============================
function buildComponents(ctx, slash) {
  const showAdmin = isOwnerHere(ctx);
  const options = Object.keys(CATEGORIES)
    .filter(c => (c !== 'Administrador') || showAdmin)
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

// ===============================
// EMBED DE CATEGORÍA (azul clickeable)
// ===============================
async function createCategoryEmbed(context, catName, slash = false) {
  const client = context.client;
  const prefix = client.getPrefix?.(context.guild?.id || context.guildId) || '!';
  const showAdmin = isOwnerHere(context);

  if (catName === 'Administrador' && !showAdmin) {
    catName = 'Información';
  }

  const embed = new EmbedBuilder()
    .setTitle(`${CATEGORY_EMOJIS[catName]} ${catName} — Comandos`)
    .setDescription(`Listado de comandos en la categoría ${catName}:`)
    .setColor('#6A0DAD');

  let appCmds = new Map();
  if (slash) {
    try {
      // Fusiona comandos globales + del guild
      const globalCmds = await client.application.commands.fetch().catch(() => new Map());
      const guildCmds = await client.application.commands.fetch({ guildId: context.guildId }).catch(() => new Map());
      appCmds = new Map([...globalCmds, ...guildCmds]);
    } catch { appCmds = new Map(); }
  }

  for (const cName of CATEGORIES[catName]) {
    const cmd = client.commands.get(cName);
    if (!cmd) continue;
    if (cName === 'testr' && !showAdmin) continue;

    if (slash) {
      const app = appCmds.get([...appCmds.keys()].find(k => appCmds.get(k).name === cmd.name));
      const title = app ? `</${cmd.name}:${app.id}>` : `/${cmd.name}`;
      embed.addFields({
        name: title,
        value: cmd.description || 'Sin descripción',
        inline: false
      });
    } else {
      embed.addFields({
        name: `${prefix}${cmd.name}`,
        value: cmd.description || 'Sin descripción',
        inline: false
      });
    }
  }

  return embed;
}

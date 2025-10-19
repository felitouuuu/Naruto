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

const CATEGORY_EMOJIS = {
  'Configuración': '⚙️',
  'Información': 'ℹ️',
  'Administrador': '🛠️'
};

const CATEGORIES = {
  'Configuración': ['setprefix'],
  'Información': ['ping', 'help'],
  'Administrador': ['testr']
};

function userCanSeeAdmin(userId, guildId) {
  return userId === OWNER_ID && guildId === TEST_GUILD_ID;
}

function visibleCategories(ctx) {
  const canSeeAdmin = userCanSeeAdmin(ctx.user?.id || ctx.author?.id, ctx.guild?.id || ctx.guildId);
  const visible = {};
  for (const [cat, cmds] of Object.entries(CATEGORIES)) {
    if (cat === 'Administrador' && !canSeeAdmin) continue;
    visible[cat] = cmds;
  }
  return visible;
}

function isPublicCommand(cmdName) {
  return !CATEGORIES['Administrador'].includes(cmdName);
}

module.exports = {
  name: 'help',
  categoria: 'Información',
  description: 'Muestra la lista de comandos y categorías o información sobre uno específico.',
  ejemplo: ['help', 'help [comando]', 'help ping'],
  syntax: '!help <comando/categoría>',

  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Muestra la lista de comandos, categorías o información sobre un comando.')
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
        .setAutocomplete(true)
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    if (focused.name !== 'comando') return interaction.respond([]);
    const query = (focused.value || '').toLowerCase();

    const all = [...interaction.client.commands.values()]
      .filter(c => c?.name && (isPublicCommand(c.name) || userCanSeeAdmin(interaction.user.id, interaction.guildId)));

    const filtered = all
      .filter(c => c.name.toLowerCase().includes(query))
      .slice(0, 25)
      .map(c => ({ name: c.name, value: c.name }));

    return interaction.respond(filtered);
  },

  async executeMessage(msg, args, prefix) {
    const commands = msg.client.commands;
    const cats = visibleCategories(msg);

    if (args[0] && commands.has(args[0])) {
      const cmd = commands.get(args[0]);
      const embed = createCommandEmbed(cmd, { prefix, slash: false });
      return msg.channel.send({ embeds: [embed] });
    }

    if (args[0] && Object.keys(cats).map(c => c.toLowerCase()).includes(args[0].toLowerCase())) {
      const cat = Object.keys(cats).find(c => c.toLowerCase() === args[0].toLowerCase());
      const embed = await createCategoryEmbed(msg, cat, false);
      return msg.channel.send({ embeds: [embed], components: buildComponents(msg) });
    }

    return sendGeneralHelp(msg, false);
  },

  async executeInteraction(interaction) {
    const commands = interaction.client.commands;
    const cats = visibleCategories(interaction);

    const cat = interaction.options.getString('categoria');
    const cmdOpt = interaction.options.getString('comando');

    if (cmdOpt && commands.has(cmdOpt) && (isPublicCommand(cmdOpt) || userCanSeeAdmin(interaction.user.id, interaction.guildId))) {
      const cmd = commands.get(cmdOpt);
      const embed = createCommandEmbed(cmd, { prefix: '/', slash: true });
      return interaction.reply({ embeds: [embed] });
    }

    if (cat && Object.keys(cats).includes(cat)) {
      const embed = await createCategoryEmbed(interaction, cat, true);
      return interaction.reply({ embeds: [embed], components: buildComponents(interaction) });
    }

    return sendGeneralHelp(interaction, true);
  },

  async handleInteraction(interaction) {
    if (interaction.isStringSelectMenu() && interaction.customId === 'help_category') {
      const cat = interaction.values[0];
      const embed = await createCategoryEmbed(interaction, cat, !!interaction.message?.interaction);
      return interaction.update({ embeds: [embed], components: buildComponents(interaction) });
    }
    if (interaction.isButton() && interaction.customId === 'help_close') {
      await interaction.message.delete().catch(() => {});
      if (!interaction.replied && !interaction.deferred) await interaction.deferUpdate().catch(() => {});
    }
  }
};

// ======================== HELPERS ========================
function buildComponents(ctx) {
  const cats = visibleCategories(ctx);
  const select = new StringSelectMenuBuilder()
    .setCustomId('help_category')
    .setPlaceholder('Selecciona una categoría')
    .addOptions(Object.keys(cats).map(cat => ({
      label: cat,
      value: cat,
      description: `Ver comandos de ${cat}`,
      emoji: CATEGORY_EMOJIS[cat]
    })));

  const rowSelect = new ActionRowBuilder().addComponents(select);
  const closeBtn = new ButtonBuilder().setCustomId('help_close').setLabel('Cerrar').setStyle(ButtonStyle.Danger);
  const rowClose = new ActionRowBuilder().addComponents(closeBtn);
  return [rowSelect, rowClose];
}

async function sendGeneralHelp(target, slash = false) {
  const client = target.client;
  const cats = visibleCategories(target);
  let visibleCmds = 0;
  for (const list of Object.values(cats)) visibleCmds += list.length;

  const prefix = slash ? '/' : client.getPrefix(target.guild?.id);

  const embed = new EmbedBuilder()
    .setTitle(`${prefix}help — Menú de ayuda`)
    .setDescription(`Categorías: **${Object.keys(cats).length}**\nComandos: **${visibleCmds}**\n\nSelecciona una categoría para ver sus comandos.`)
    .setColor('#6A0DAD');

  for (const cat of Object.keys(cats)) {
    embed.addFields({ name: `${CATEGORY_EMOJIS[cat]} ${cat}`, value: `\`${prefix}help ${cat}\``, inline: false });
  }

  const components = buildComponents(target);
  if (slash) return target.reply({ embeds: [embed], components });
  else return target.channel.send({ embeds: [embed], components });
}

function createCommandEmbed(cmd, ctx) {
  const prefix = ctx.slash ? '/' : ctx.prefix;
  const categoria = cmd.categoria || 'Información';
  const emoji = CATEGORY_EMOJIS[categoria] || 'ℹ️';
  const ejemplos = Array.isArray(cmd.ejemplo) ? cmd.ejemplo : [cmd.ejemplo || cmd.name];
  const ejemplosTxt = ejemplos.map(e => `\`${prefix}${e.replace(/^\//, '')}\``).join('\n');

  return new EmbedBuilder()
    .setColor('#6A0DAD')
    .setTitle(`Comando: ${prefix}${cmd.name}`)
    .setDescription(cmd.description || 'Sin descripción.')
    .addFields(
      { name: 'Categoría', value: `${categoria} ${emoji}`, inline: false },
      { name: 'Ejemplo(s)', value: ejemplosTxt, inline: false },
      { name: 'Sintaxis', value: `${cmd.syntax || `${prefix}${cmd.name} <requerido> [opcional]`}`, inline: false }
    )
    .setTimestamp();
}

async function createCategoryEmbed(ctx, cat, slash) {
  const client = ctx.client;
  const embed = new EmbedBuilder()
    .setColor('#6A0DAD')
    .setTitle(`${CATEGORY_EMOJIS[cat]} ${cat} — Comandos`)
    .setDescription(`Listado de comandos en la categoría ${cat}:`);

  let appCmds = null;
  if (slash) {
    try {
      const gid = ctx.guildId || ctx.guild?.id || null;
      appCmds = gid
        ? await client.application.commands.fetch({ guildId: gid })
        : await client.application.commands.fetch();
    } catch {}
  }

  const cats = visibleCategories(ctx);
  for (const name of cats[cat] || []) {
    const cmd = client.commands.get(name);
    if (!cmd) continue;

    if (slash) {
      const found = appCmds ? appCmds.find(x => x.name === name) : null;
      embed.addFields({
        name: found ? `</${name}:${found.id}>` : `/${name}`,
        value: cmd.description || 'Sin descripción.',
        inline: false
      });
    } else {
      const prefix = client.getPrefix(ctx.guild?.id);
      embed.addFields({ name: `${prefix}${name}`, value: cmd.description || 'Sin descripción.', inline: false });
    }
  }
  return embed;
}

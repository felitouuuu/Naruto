const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  SlashCommandBuilder
} = require('discord.js');

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
          { name: 'testr', value: 'testr' },
          { name: 'help', value: 'help' },
          { name: 'setprefix', value: 'setprefix' }
        )
    ),

  executeMessage: async (msg, args) => {
    const commands = msg.client.commands;
    const prefix = msg.client.PREFIX;

    if (args[0] && commands.has(args[0])) {
      const cmd = commands.get(args[0]);
      return msg.channel.send({ embeds: [createCommandEmbed(cmd, prefix)] });
    }

    if (args[0] && Object.keys(CATEGORIES).map(c => c.toLowerCase()).includes(args[0].toLowerCase())) {
      const catName = Object.keys(CATEGORIES).find(c => c.toLowerCase() === args[0].toLowerCase());
      return sendCategoryEmbed(msg, catName, false);
    }

    return sendGeneralHelp(msg, false);
  },

  executeInteraction: async (interaction) => {
    const commands = interaction.client.commands;
    const cat = interaction.options.getString('categoria');
    const cmdOpt = interaction.options.getString('comando');

    if (cmdOpt && commands.has(cmdOpt)) {
      const cmd = commands.get(cmdOpt);
      return interaction.reply({ embeds: [createCommandEmbed(cmd, '/')], ephemeral: false });
    }

    if (cat && Object.keys(CATEGORIES).includes(cat)) {
      return sendCategoryEmbed(interaction, cat, true);
    }

    return sendGeneralHelp(interaction, true);
  },

  handleInteraction: async (interaction) => {
    if (interaction.isStringSelectMenu() && interaction.customId === 'help_category') {
      const catName = interaction.values[0];
      if (!catName) return;
      const isSlashContext = !!(interaction.message?.interaction && interaction.message.interaction.commandName === 'help');
      const embed = await createCategoryEmbed(interaction, catName, isSlashContext);
      const components = buildComponents();
      return interaction.update({ embeds: [embed], components });
    }

    if (interaction.isButton() && interaction.customId === 'help_close') {
      await interaction.message.delete().catch(() => {});
      if (!interaction.replied && !interaction.deferred) await interaction.deferUpdate().catch(() => {});
    }
  }
};

function createCommandEmbed(cmd, prefix) {
  return new EmbedBuilder()
    .setTitle(`Comando: ${prefix}${cmd.name}`)
    .setDescription(cmd.description || 'Sin descripción.')
    .addFields({ name: 'Ejemplo', value: `\`${prefix}${cmd.name}\`` })
    .setFooter({ text: `Sintaxis: ${cmd.syntax || `${prefix}${cmd.name}`}` })
    .setColor('#6A0DAD')
    .setTimestamp();
}

async function sendGeneralHelp(target, slash = false) {
  const client = target.client;
  let slashCountText = '';

  if (slash) {
    try {
      const guildId = target.guildId || (target.guild && target.guild.id);
      if (guildId) {
        const appCmds = await client.application.commands.fetch({ guildId }).catch(() => null);
        slashCountText = appCmds ? `${appCmds.size} comandos (slash)` : `${client.commands.size} comandos`;
      } else {
        slashCountText = `${client.commands.size} comandos`;
      }
    } catch {
      slashCountText = `${client.commands.size} comandos`;
    }
  }

  const embed = new EmbedBuilder()
    .setTitle(`${slash ? '/' : client.PREFIX}help — Menú de ayuda`)
    .setDescription(
      `Categorías: **${Object.keys(CATEGORIES).length}**\n` +
      (slash ? `${slashCountText}` : `${client.commands.size} comandos totales`) +
      `\n\nSelecciona una categoría para ver sus comandos.`
    )
    .setColor('#6A0DAD');

  for (const cat in CATEGORIES) {
    const names = CATEGORIES[cat]
      .map(name => {
        const c = client.commands.get(name);
        if (!c) return null;
        return slash ? `\`/${c.name}\`` : `\`${client.PREFIX}${c.name}\``;
      })
      .filter(Boolean)
      .join(', ') || 'Sin comandos';
    embed.addFields({ name: `${CATEGORY_EMOJIS[cat]} ${cat}`, value: names, inline: false });
  }

  const components = buildComponents();
  if (slash && target.reply) return target.reply({ embeds: [embed], components, ephemeral: false });
  else if (!slash && target.channel) return target.channel.send({ embeds: [embed], components });
  else return null;
}

async function sendCategoryEmbed(target, catName, slash = false) {
  const embed = await createCategoryEmbed(target, catName, slash);
  const components = buildComponents();

  if (slash) {
    if (target.reply) return target.reply({ embeds: [embed], components, ephemeral: false }).catch(async () => {
      try { await target.update({ embeds: [embed], components }); } catch {}
    });
    else return target.channel.send({ embeds: [embed], components });
  } else {
    return target.channel.send({ embeds: [embed], components });
  }
}

function buildComponents() {
  const select = new StringSelectMenuBuilder()
    .setCustomId('help_category')
    .setPlaceholder('Selecciona una Categoría')
    .addOptions(Object.keys(CATEGORIES).map(cat => ({
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

async function createCategoryEmbed(context, catName, slash = false) {
  const client = context.client;
  const embed = new EmbedBuilder()
    .setTitle(`${CATEGORY_EMOJIS[catName]} ${catName} — Comandos`)
    .setDescription(`Listado de comandos en la categoría ${catName}:`)
    .setColor('#6A0DAD');

  let appCmds = null;
  if (slash) {
    try {
      const guildId = context.guildId || (context.guild && context.guild.id);
      if (guildId) {
        appCmds = await client.application.commands.fetch({ guildId }).catch(() => null);
      } else {
        appCmds = await client.application.commands.fetch().catch(() => null);
      }
    } catch {
      appCmds = null;
    }
  }

  for (const cName of CATEGORIES[catName]) {
    const cmd = client.commands.get(cName);
    if (!cmd) continue;

    if (slash) {
      const app = appCmds ? appCmds.find(x => x.name === cmd.name) : null;
      if (app) {
        embed.addFields({
          name: `</${cmd.name}:${app.id}>`,
          value: cmd.description || 'Sin descripción',
          inline: false
        });
      } else {
        embed.addFields({
          name: `/${cmd.name}`,
          value: cmd.description || 'Sin descripción (ID no encontrado)',
          inline: false
        });
      }
    } else {
      embed.addFields({
        name: `${client.PREFIX}${cmd.name}`,
        value: cmd.description || 'Sin descripción',
        inline: false
      });
    }
  }

  return embed;
}
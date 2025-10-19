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

  // ------------------ PREFIJO ------------------
  executeMessage: async (msg, args) => {
    const commands = msg.client.commands;
    const prefix = msg.client.PREFIX;

    // !help <comando>
    if (args[0] && commands.has(args[0])) {
      const cmd = commands.get(args[0]);
      return msg.channel.send({ embeds: [createCommandEmbed(cmd, prefix)] });
    }

    // !help <categoría>
    if (args[0] && Object.keys(CATEGORIES).map(c => c.toLowerCase()).includes(args[0].toLowerCase())) {
      const catName = Object.keys(CATEGORIES).find(c => c.toLowerCase() === args[0].toLowerCase());
      return await sendCategoryEmbed(msg, catName, false);
    }

    // !help
    return await sendGeneralHelp(msg, false);
  },

  // ------------------ SLASH ------------------
  executeInteraction: async (interaction) => {
    const commands = interaction.client.commands;
    const cat = interaction.options.getString('categoria');
    const cmdOpt = interaction.options.getString('comando');

    // /help comando
    if (cmdOpt && commands.has(cmdOpt)) {
      const cmd = commands.get(cmdOpt);
      return interaction.reply({ embeds: [createCommandEmbed(cmd, '/')], ephemeral: false });
    }

    // /help categoria
    if (cat && Object.keys(CATEGORIES).includes(cat)) {
      return await sendCategoryEmbed(interaction, cat, true);
    }

    // /help
    return await sendGeneralHelp(interaction, true);
  },

  // ------------------ INTERACCIÓN (menu / botón) ------------------
  handleInteraction: async (interaction) => {
    // menú desplegable
    if (interaction.isStringSelectMenu() && interaction.customId === 'help_category') {
      const catName = interaction.values[0];
      if (!catName) return;
      // Crear embed actualizado (necesita fetch de comandos si es slash)
      const isSlashContext = !!(interaction.isCommand && interaction.isCommand());
      const embed = await createCategoryEmbed(interaction, catName, true); // interaction passed so we can fetch guild commands
      const components = buildComponents();
      // update (edita el mismo mensaje, no crea uno nuevo)
      return interaction.update({ embeds: [embed], components });
    }

    // botón cerrar
    if (interaction.isButton() && interaction.customId === 'help_close') {
      await interaction.message.delete().catch(() => {});
      if (!interaction.replied && !interaction.deferred) await interaction.deferUpdate().catch(() => {});
    }
  }
};

// ------------------ HELP: FUNCIONES AUXILIARES ------------------

// Embed individual comando
function createCommandEmbed(cmd, prefix) {
  return new EmbedBuilder()
    .setTitle(`Comando: ${prefix}${cmd.name}`)
    .setDescription(cmd.description || 'Sin descripción.')
    .addFields({ name: 'Ejemplo', value: `\`${prefix}${cmd.name}\`` })
    .setFooter({ text: `Sintaxis: ${cmd.syntax || `${prefix}${cmd.name}`}` })
    .setColor('#6A0DAD')
    .setTimestamp();
}

// Enviar menú general
async function sendGeneralHelp(target, slash = false) {
  const client = target.client;
  // Si slash: queremos contar comandos slash registrados en el guild
  let slashCount = 0;
  if (slash) {
    try {
      const guildId = target.guildId || (target.guild && target.guild.id);
      if (guildId) {
        const appCmds = await client.application.commands.fetch({ guildId }).catch(() => null);
        if (appCmds) slashCount = appCmds.size;
      }
    } catch { /* ignore */ }
  }

  const embed = new EmbedBuilder()
    .setTitle(`${slash ? '/' : client.PREFIX}help — Menú de ayuda`)
    .setDescription(
      `${Object.keys(CATEGORIES).length} categorías\n` +
      `${slash ? `${slashCount} comandos (slash)` : `${client.commands.size} comandos`}`
    )
    .setColor('#6A0DAD');

  for (const cat in CATEGORIES) {
    embed.addFields({
      name: `${CATEGORY_EMOJIS[cat]} ${cat}`,
      value: `\`${slash ? '/' : client.PREFIX}help ${cat}\``,
      inline: false
    });
  }

  const components = buildComponents();

  if (slash) {
    // interaction or command context: reply visible to all
    return target.reply({ embeds: [embed], components, ephemeral: false });
  } else {
    return target.channel.send({ embeds: [embed], components });
  }
}

// Enviar embed de categoría (usa createCategoryEmbed)
async function sendCategoryEmbed(target, catName, slash = false) {
  const embed = await createCategoryEmbed(target, catName, slash);
  const components = buildComponents();
  if (slash) return target.reply({ embeds: [embed], components, ephemeral: false });
  else return target.channel.send({ embeds: [embed], components });
}

// Construcción de componentes (select + close)
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

/**
 * Crea el embed de categoría.
 * Si `context` es un Interaction (típicamente slash), se usa para hacer fetch de los app commands del GUILD
 * y construir las menciones de comando `</name:id>` automáticamente.
 *
 * Parámetros:
 * - context: puede ser interaction (tiene guildId) o message (msg)
 * - catName: nombre de la categoría
 * - slash: boolean (si true busca los IDs de comandos slash y muestra menciones)
 */
async function createCategoryEmbed(context, catName, slash = false) {
  const client = context.client;
  const embed = new EmbedBuilder()
    .setTitle(`${CATEGORY_EMOJIS[catName]} ${catName} — Comandos`)
    .setDescription(`Listado de comandos en la categoría ${catName}:`)
    .setColor('#6A0DAD');

  // obtener lista de comandos registrados del guild si slash=true
  let appCmdsCache = null;
  if (slash) {
    try {
      const guildId = context.guildId || (context.guild && context.guild.id);
      if (guildId) {
        appCmdsCache = await client.application.commands.fetch({ guildId }).catch(() => null);
      } else {
        // fallback: fetch global (menos preferible)
        appCmdsCache = await client.application.commands.fetch().catch(() => null);
      }
    } catch (err) {
      appCmdsCache = null;
    }
  }

  for (const cName of CATEGORIES[catName]) {
    const cmd = client.commands.get(cName);
    if (!cmd) continue;

    if (slash) {
      // buscar comando de la aplicación por nombre
      const appCmd = appCmdsCache ? appCmdsCache.find(x => x.name === cmd.name) : null;
      if (appCmd) {
        // formato de mención de comando: </name:id>
        embed.addFields({
          name: `</${cmd.name}:${appCmd.id}>`,
          value: cmd.description || 'Sin descripción',
          inline: false
        });
      } else {
        // fallback: mostrar /name si no encontramos id
        embed.addFields({
          name: `/${cmd.name}`,
          value: cmd.description || 'Sin descripción (no se encontró ID del slash command)',
          inline: false
        });
      }
    } else {
      // prefijo actual (mensaje)
      embed.addFields({
        name: `${client.PREFIX}${cmd.name}`,
        value: cmd.description || 'Sin descripción',
        inline: false
      });
    }
  }

  return embed;
}
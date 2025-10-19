const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const OWNER_ID = '1003512479277662208';
const TEST_GUILD_ID = '1390187634093199461';
const COLOR_BASE = '#6A0DAD';

module.exports = {
  name: 'help',
  categoria: 'Información',
  description: 'Muestra la lista de comandos y categorías o información sobre uno específico.',
  ejemplo: 'help\nhelp <comando>\nhelp <categoría>',
  syntax: '<comando/categoría>',
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Muestra la lista de comandos y categorías o información sobre uno específico.')
    .addStringOption(option =>
      option
        .setName('comando')
        .setDescription('Nombre del comando o categoría')
        .setAutocomplete(true)
    ),

  async executeMessage(msg, args) {
    const prefix = msg.client.getPrefix(msg.guild?.id);
    const arg = args[0]?.toLowerCase();

    const comandos = [...msg.client.commands.values()];
    const categorias = {};

    // Clasificar comandos por categoría
    for (const cmd of comandos) {
      if (cmd.name === 'testr') continue;
      if (cmd.categoria === 'Administrador' &&
          !(msg.author.id === OWNER_ID && msg.guild?.id === TEST_GUILD_ID)) continue;
      const cat = cmd.categoria || 'Otros';
      if (!categorias[cat]) categorias[cat] = [];
      categorias[cat].push(cmd);
    }

    // Si pide info de un comando específico
    if (arg) {
      const cmd = comandos.find(c => c.name.toLowerCase() === arg);
      if (!cmd) return msg.reply('❌ No se encontró ese comando.');

      const embed = new EmbedBuilder()
        .setColor(COLOR_BASE)
        .setTitle(`Comando: ${prefix}${cmd.name}`)
        .setDescription(cmd.description || 'Sin descripción.')
        .addFields(
          { name: 'Categoría', value: cmd.categoria || 'Sin categoría', inline: false },
          { name: 'Ejemplo(s)', value: (cmd.ejemplo || `${prefix}${cmd.name}`).split('\n').map(e => `${prefix}${e}`).join('\n'), inline: false },
          { name: 'Sintaxis', value: `${prefix}${cmd.syntax || cmd.name}`, inline: false }
        )
        .setTimestamp();

      return msg.reply({ embeds: [embed] });
    }

    // Embed principal
    const categoriasList = Object.keys(categorias);
    const total = comandos.length;
    const embed = new EmbedBuilder()
      .setColor(COLOR_BASE)
      .setTitle(`📖 ${prefix}help — Menú de ayuda`)
      .setDescription(`Categorías: **${categoriasList.length}**\nComandos: **${total}**\n\nSelecciona una categoría para ver sus comandos.`)
      .setTimestamp();

    const opciones = categoriasList.map(cat => ({
      label: cat,
      description: `Ver comandos de ${cat}`,
      value: cat
    }));

    const menu = new StringSelectMenuBuilder()
      .setCustomId('help_menu')
      .setPlaceholder('Selecciona una categoría')
      .addOptions(opciones);

    const row = new ActionRowBuilder().addComponents(menu);
    const cerrar = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('cerrar_help').setLabel('Cerrar').setStyle(ButtonStyle.Danger)
    );

    await msg.reply({ embeds: [embed], components: [row, cerrar] });
  },

  async executeInteraction(interaction) {
    const comando = interaction.options.getString('comando');
    const prefix = interaction.client.getPrefix(interaction.guild?.id);
    const comandos = [...interaction.client.commands.values()];
    const categorias = {};

    // Clasificar comandos
    for (const cmd of comandos) {
      if (cmd.name === 'testr') continue;
      if (cmd.categoria === 'Administrador' &&
          !(interaction.user.id === OWNER_ID && interaction.guild?.id === TEST_GUILD_ID)) continue;
      const cat = cmd.categoria || 'Otros';
      if (!categorias[cat]) categorias[cat] = [];
      categorias[cat].push(cmd);
    }

    // Si busca un comando específico
    if (comando) {
      const cmd = comandos.find(c => c.name.toLowerCase() === comando.toLowerCase());
      if (!cmd) return interaction.reply({ content: '❌ No se encontró ese comando.', ephemeral: true });

      const embed = new EmbedBuilder()
        .setColor(COLOR_BASE)
        .setTitle(`Comando: /${cmd.name}`)
        .setDescription(cmd.description || 'Sin descripción.')
        .addFields(
          { name: 'Categoría', value: cmd.categoria || 'Sin categoría', inline: false },
          { name: 'Ejemplo(s)', value: (cmd.ejemplo || `/${cmd.name}`).split('\n').map(e => `/${e}`).join('\n'), inline: false },
          { name: 'Sintaxis', value: `/${cmd.syntax || cmd.name}`, inline: false }
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // Embed general (con formato azul clickeable)
    const globalCmds = await interaction.client.application.commands.fetch();
    const embed = new EmbedBuilder()
      .setColor(COLOR_BASE)
      .setTitle(`📘 Información — Comandos`)
      .setDescription(`Listado de comandos en la categoría Información:`);

    for (const cmd of comandos.filter(c => c.categoria === 'Información')) {
      const globalCmd = globalCmds.find(c => c.name === cmd.name);
      const clickable = globalCmd ? `</${cmd.name}:${globalCmd.id}>` : `/${cmd.name}`;
      embed.addFields({
        name: clickable,
        value: cmd.description || 'Sin descripción.',
        inline: false
      });
    }

    return interaction.reply({ embeds: [embed], ephemeral: true });
  },

  async handleInteraction(interaction) {
    if (interaction.customId === 'cerrar_help') {
      return interaction.message.delete().catch(() => {});
    }

    if (interaction.customId === 'help_menu') {
      const cat = interaction.values[0];
      const prefix = interaction.client.getPrefix(interaction.guild?.id);
      const cmds = [...interaction.client.commands.values()]
        .filter(c => c.categoria === cat && c.name !== 'testr');

      const embed = new EmbedBuilder()
        .setColor(COLOR_BASE)
        .setTitle(`${cat} — Comandos`)
        .setDescription(`Listado de comandos en la categoría ${cat}:`);

      const globalCmds = await interaction.client.application.commands.fetch();

      for (const cmd of cmds) {
        const globalCmd = globalCmds.find(c => c.name === cmd.name);
        const clickable = globalCmd ? `</${cmd.name}:${globalCmd.id}>` : `/${cmd.name}`;
        embed.addFields({ name: clickable, value: cmd.description || 'Sin descripción.', inline: false });
      }

      await interaction.update({ embeds: [embed], components: interaction.message.components });
    }
  }
};

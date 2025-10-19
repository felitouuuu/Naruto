const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');

module.exports = {
  name: 'ping',
  description: 'Muestra la latencia del bot.',
  categoria: 'Información',
  categoriaEmoji: 'ℹ️',
  ejemplos: ['ping', 'ping [comando]', 'ping !help'],
  syntax: '<requerido> [opcional]',
  color: '#6A0DAD',

  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Muestra la latencia del bot.'),

  // ---------- PREFIJO ----------
  executeMessage: async (msg) => {
    const sent = await msg.channel.send('Calculando...').catch(() => null);
    const latencyMessage = sent ? (sent.createdTimestamp - msg.createdTimestamp) : 'N/A';
    const latencyAPI = Math.round(msg.client.ws.ping);
    const prefix = msg.client.getPrefix(msg.guild?.id);

    const embed = new EmbedBuilder()
      .setTitle('🏓 Pong!')
      .setDescription(`**Latencia del bot**\nVerifica la velocidad de respuesta.`)
      .addFields(
        { name: 'API (Discord)', value: `${latencyAPI} ms`, inline: true },
        { name: 'Mensaje', value: `${latencyMessage} ms`, inline: true },
        { name: 'Ejemplos', value: `\`${prefix}ping\`\n\`${prefix}ping [comando]\`\n\`${prefix}help ping\``, inline: false },
        { name: 'Categoría', value: 'ℹ️ Información', inline: true },
        { name: 'Sintaxis', value: `${prefix}ping <requerido> [opcional]`, inline: true }
      )
      .setColor('#6A0DAD')
      .setTimestamp();

    if (sent) await sent.edit({ content: '', embeds: [embed] });
    else msg.channel.send({ embeds: [embed] });
  },

  // ---------- SLASH ----------
  executeInteraction: async (interaction) => {
    const latencyAPI = Math.round(interaction.client.ws.ping);
    const latencyMessage = Math.round(Date.now() - interaction.createdTimestamp);

    const embed = new EmbedBuilder()
      .setTitle('🏓 Pong!')
      .setDescription(`**Latencia del bot**\nVerifica la velocidad de respuesta.`)
      .addFields(
        { name: 'API (Discord)', value: `${latencyAPI} ms`, inline: true },
        { name: 'Mensaje', value: `${latencyMessage} ms`, inline: true },
        { name: 'Ejemplos', value: '`/ping`\n`/ping [comando]`\n`/help ping`', inline: false },
        { name: 'Categoría', value: 'ℹ️ Información', inline: true },
        { name: 'Sintaxis', value: '/ping <requerido> [opcional]', inline: true }
      )
      .setColor('#6A0DAD')
      .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
};

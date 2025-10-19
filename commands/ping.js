const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'ping',
  categoria: 'Información',
  ejemplo:'ping',
  description: 'Muestra la latencia del bot.',
  data: new SlashCommandBuilder().setName('ping').setDescription('Muestra la latencia del bot.'),

  async executeMessage(msg) {
    const sent = await msg.channel.send('🏓 Calculando...');
    const embed = new EmbedBuilder()
      .setColor('#6A0DAD')
      .setTitle('🏓 ¡Pong!')
      .setDescription('Verifica la velocidad de respuesta.')
      .addFields(
        { name: 'API (Discord)', value: `${msg.client.ws.ping} ms`, inline: true },
        { name: 'Mensaje', value: `${sent.createdTimestamp - msg.createdTimestamp} ms`, inline: true }
      )
      .setTimestamp();
    sent.edit({ content: null, embeds: [embed] });
  },

  async executeInteraction(interaction) {
    const reply = await interaction.reply({ content: '🏓 Calculando...', fetchReply: true });
    const embed = new EmbedBuilder()
      .setColor('#6A0DAD')
      .setTitle('🏓 ¡Pong!')
      .setDescription('Verifica la velocidad de respuesta.')
      .addFields(
        { name: 'API (Discord)', value: `${interaction.client.ws.ping} ms`, inline: true },
        { name: 'Mensaje', value: `${reply.createdTimestamp - interaction.createdTimestamp} ms`, inline: true }
      )
      .setTimestamp();
    await interaction.editReply({ content: null, embeds: [embed] });
  }
};

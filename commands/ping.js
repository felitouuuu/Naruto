// 🏓 ping.js — Muestra la latencia del bot
const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');

module.exports = {
  name: 'ping',
  ejemplo: 'ping',
  categoria: 'Información',
  description: 'Muestra la latencia del bot.',
  syntax: '<prefix> [comando]',
  
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Muestra la latencia del bot'),

  executeMessage: async (msg) => {
    const prefix = msg.client.getPrefix(msg.guild.id);
    const sent = await msg.channel.send('Calculando información...').catch(() => null);
    const latencyMessage = sent ? (sent.createdTimestamp - msg.createdTimestamp) : 'N/A';
    const latencyAPI = Math.round(msg.client.ws.ping);

    const embed = new EmbedBuilder()
      .setTitle('🏓 Información del bot')
      .setColor('#6A0DAD')
      .setDescription('Aquí tienes los datos de latencia:')
      .addFields(
        { name: 'Latencia del Bot', value: `${latencyMessage} ms`, inline: true },
        { name: 'Latencia API', value: `${latencyAPI} ms`, inline: true }
      )
      .setFooter({ text: `Comando: ${prefix}ping` })
      .setTimestamp();

    if (sent) await sent.edit({ content: '', embeds: [embed] }).catch(() => msg.channel.send({ embeds: [embed] }));
    else msg.channel.send({ embeds: [embed] });
  },

  executeInteraction: async (interaction) => {
    const latencyAPI = Math.round(interaction.client.ws.ping);
    const latencyMessage = Math.round(Date.now() - interaction.createdTimestamp);

    const embed = new EmbedBuilder()
      .setTitle('🏓 Información del bot')
      .setColor('#6A0DAD')
      .setDescription('Aquí tienes los datos de latencia:')
      .addFields(
        { name: 'Latencia del Bot', value: `${latencyMessage} ms`, inline: true },
        { name: 'Latencia API', value: `${latencyAPI} ms`, inline: true }
      )
      .setFooter({ text: 'Comando: /ping' })
      .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
};

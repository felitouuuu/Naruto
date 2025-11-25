// commands/valuestop.js
const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const fs = require('fs');

module.exports = {
  name: 'valuestop',
  description: 'Elimina tu valor actual.',
  category: 'Criptos',
  ejemplo: 'valuestop',
  syntax: '<prefix_actual> valuestop',

  data: new SlashCommandBuilder()
    .setName('valuestop')
    .setDescription('Eliminar tu valor'),

  async executeMessage(msg) {
    const db = JSON.parse(fs.readFileSync('./database/value.json', 'utf8'));

    if (!db[msg.author.id]) {
      const embed = new EmbedBuilder()
        .setTitle('Sin valor asignado')
        .setDescription('No tienes ningún valor guardado.')
        .setColor('#FF0000');

      return msg.channel.send({ embeds: [embed] });
    }

    delete db[msg.author.id];
    fs.writeFileSync('./database/value.json', JSON.stringify(db, null, 2));

    const embed = new EmbedBuilder()
      .setTitle('Valor eliminado')
      .setDescription('Tu valor ha sido eliminado correctamente.')
      .setColor('#6A0DAD');

    return msg.channel.send({ embeds: [embed] });
  },

  async executeInteraction(interaction) {
    const db = JSON.parse(fs.readFileSync('./database/value.json', 'utf8'));

    if (!db[interaction.user.id]) {
      const embed = new EmbedBuilder()
        .setTitle('Sin valor asignado')
        .setDescription('No tienes ningún valor guardado.')
        .setColor('#FF0000');

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    delete db[interaction.user.id];
    fs.writeFileSync('./database/value.json', JSON.stringify(db, null, 2));

    const embed = new EmbedBuilder()
      .setTitle('Valor eliminado')
      .setDescription('Tu valor ha sido eliminado correctamente.')
      .setColor('#6A0DAD');

    return interaction.reply({ embeds: [embed] });
  }
};

// commands/valueset.js
const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const fs = require('fs');

module.exports = {
  name: 'valueset',
  description: 'Establece el valor de tu perfil.',
  category: 'Value',
  ejemplo: 'valueset 500',
  syntax: '<prefix_actual> valueset <numero>',

  data: new SlashCommandBuilder()
    .setName('valueset')
    .setDescription('Establecer tu valor')
    .addIntegerOption(opt =>
      opt.setName('cantidad')
        .setDescription('Nuevo valor')
        .setRequired(true)
    ),

  async executeMessage(msg, args) {
    const amount = parseInt(args[0]);
    if (!amount || amount <= 0) {
      const embed = new EmbedBuilder()
        .setTitle('Uso incorrecto')
        .setDescription('Debes escribir un número válido.')
        .setColor('#FF0000');
      return msg.channel.send({ embeds: [embed] });
    }

    const db = JSON.parse(fs.readFileSync('./database/value.json', 'utf8'));
    db[msg.author.id] = amount;
    fs.writeFileSync('./database/value.json', JSON.stringify(db, null, 2));

    const embed = new EmbedBuilder()
      .setTitle('Valor actualizado')
      .setDescription(`Tu valor ahora es **${amount}**`)
      .setColor('#6A0DAD');

    return msg.channel.send({ embeds: [embed] });
  },

  async executeInteraction(interaction) {
    const amount = interaction.options.getInteger('cantidad');

    const db = JSON.parse(fs.readFileSync('./database/value.json', 'utf8'));
    db[interaction.user.id] = amount;
    fs.writeFileSync('./database/value.json', JSON.stringify(db, null, 2));

    const embed = new EmbedBuilder()
      .setTitle('Valor actualizado')
      .setDescription(`Tu valor ahora es **${amount}**`)
      .setColor('#6A0DAD');

    return interaction.reply({ embeds: [embed] });
  }
};

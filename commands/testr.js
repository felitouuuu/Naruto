const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

const OWNER_ID = '1003512479277662208';
const TEST_GUILD_ID = '1390187634093199461';
const CANAL_ID = '1401680611810476082';
const ROL_ID = '1390189325244829737';

module.exports = {
  name: 'testr',
  description: 'Envía un test de reinicio al canal designado.',
  categoria: 'Administrador',
  categoriaEmoji: '🛠️',
  ejemplos: ['testr'],
  syntax: '<requerido>',
  color: '#6A0DAD',

  data: new SlashCommandBuilder()
    .setName('testr')
    .setDescription('Envía un test de reinicio.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  executeMessage: async (msg) => {
    // Solo el owner en el servidor de prueba puede usar este comando
    if (msg.guild?.id !== TEST_GUILD_ID || msg.author.id !== OWNER_ID) {
      return msg.reply('❌ Ese comando no existe.');
    }

    const ch = msg.client.channels.cache.get(CANAL_ID) || await msg.client.channels.fetch(CANAL_ID).catch(() => null);
    if (ch) await ch.send(`<@&${ROL_ID}> ✅ Test reinicio exitoso.`).catch(() => {});
    await msg.reply('Test reinicio enviado correctamente ✅');
  },

  executeInteraction: async (interaction) => {
    // Solo el owner en el servidor de prueba puede usar este comando
    if (interaction.guild?.id !== TEST_GUILD_ID || interaction.user.id !== OWNER_ID) {
      return interaction.reply({ content: '❌ Ese comando no existe.', ephemeral: true });
    }

    const ch = interaction.client.channels.cache.get(CANAL_ID) || await interaction.client.channels.fetch(CANAL_ID).catch(() => null);
    if (ch) await ch.send(`<@&${ROL_ID}> ✅ Test reinicio exitoso.`).catch(() => {});
    await interaction.reply({ content: 'Test reinicio enviado correctamente ✅', ephemeral: true });
  }
};

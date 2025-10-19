// 🔒 testr.js — Comando exclusivo del owner
const { SlashCommandBuilder } = require('discord.js');

const OWNER_ID = '1003512479277662208';
const TEST_GUILD_ID = '1390187634093199461';
const CANAL_ID = '1401680611810476082';
const ROL_ID = '1390189325244829737';

module.exports = {
  name: 'testr',
  ejemplo: 'testr',
  categoria: 'Administrador',
  description: 'Envía un test de reinicio al canal designado (solo propietario).',
  syntax: '<prefix> [comando]',

  data: new SlashCommandBuilder()
    .setName('testr')
    .setDescription('Envía un test de reinicio (solo propietario)'),

  executeMessage: async (msg) => {
    if (msg.author.id !== OWNER_ID || msg.guild.id !== TEST_GUILD_ID)
      return msg.reply('❌ Comando no existe o no tienes permiso.');

    const ch = msg.client.channels.cache.get(CANAL_ID)
      || await msg.client.channels.fetch(CANAL_ID).catch(() => null);
    if (ch) await ch.send(`<@&${ROL_ID}> ✅ Test reinicio exitoso.`).catch(() => {});
    await msg.reply('Test reinicio enviado correctamente.');
  },

  executeInteraction: async (interaction) => {
    if (interaction.user.id !== OWNER_ID || interaction.guild.id !== TEST_GUILD_ID)
      return interaction.reply({ content: '❌ Comando no existe.', ephemeral: true });

    const ch = interaction.client.channels.cache.get(CANAL_ID)
      || await interaction.client.channels.fetch(CANAL_ID).catch(() => null);
    if (ch) await ch.send(`<@&${ROL_ID}> ✅ Test reinicio exitoso.`).catch(() => {});
    await interaction.reply({ content: 'Test reinicio enviado correctamente.', ephemeral: true });
  }
};

const { REST, Routes } = require('discord.js');
const fs = require('fs');

// Leer todos los archivos de comandos
const commandFiles = fs.readdirSync('./').filter(f => f.endsWith('.js') && f !== 'index.js');

const commands = [];
for (const file of commandFiles) {
    const command = require(`./${file}`);
    if (command.data) commands.push(command.data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
    try {
        console.log(`🔄 Registrando ${commands.length} comandos slash...`);

        // Registrarlos en tu servidor de pruebas (GUILD_ID)
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands }
        );

        console.log('✅ Comandos slash registrados correctamente.');
    } catch (error) {
        console.error(error);
    }
})();

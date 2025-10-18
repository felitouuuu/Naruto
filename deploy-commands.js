const fs = require('fs');
const { REST, Routes } = require('discord.js');

const deployedFile = './commands-deployed.json';
const commandFiles = fs.readdirSync('./').filter(f => f.endsWith('.js') && f !== 'index.js');

const commands = [];
for (const file of commandFiles) {
    const cmd = require(`./${file}`);
    if (cmd.data) commands.push(cmd.data.toJSON());
}

// Verificar si hay cambios respecto a la última subida
let needsUpdate = true;
if (fs.existsSync(deployedFile)) {
    const deployed = JSON.parse(fs.readFileSync(deployedFile));
    needsUpdate = JSON.stringify(deployed) !== JSON.stringify(commands);
}

if (!needsUpdate) {
    console.log('✅ Comandos ya están actualizados. No se hace nada.');
    process.exit(0);
}

// Subir comandos
const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
(async () => {
    try {
        console.log(`🔄 Registrando ${commands.length} comandos slash...`);
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands }
        );
        console.log('✅ Comandos slash registrados correctamente.');

        fs.writeFileSync(deployedFile, JSON.stringify(commands, null, 2));
    } catch (err) {
        console.error(err);
    }
})();
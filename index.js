// index.js (modificado)
// Requiere: node-fetch, discord.js v12.x
const { Client, MessageEmbed } = require('discord.js');
const fetch = require('node-fetch');

const client = new Client();

const CANAL_ID = '1401680611810476082';
const ROL_ID = '1390189325244829737';

// --- Respaldo manual (ajusta si quieres)
let baseCredito = 5.00;   // lo que indicas que tienes ahora mismo
const creditoMensual = 1.00; // +$1 mensual (se muestra en "total")
let usadoCredito = 0.64;  // lo que ya has gastado (respaldo)

// Endpoint GraphQL de Railway (public API)
const RAILWAY_GQL = 'https://backboard.railway.app/graphql/v2'; // la docs usa este endpoint
const RAILWAY_TOKEN = process.env.RAILWAY_TOKEN || null; // pon aquí tu token de Railway

let avisoEnviadoBajo = false; // para aviso único cuando <= 0.10
let avisoApagadoEnviado = false;

function formatoMoney(n) {
  return `$${Number(n).toFixed(2)}`;
}

function obtenerTotalCreditoManual() {
  return Number((baseCredito + creditoMensual).toFixed(2));
}
function obtenerCreditoRestanteManual() {
  return Number(Math.max(0, obtenerTotalCreditoManual() - usadoCredito).toFixed(2));
}

// helper: hace POST GraphQL
async function railwayQuery(query, variables = {}) {
  if (!RAILWAY_TOKEN) throw new Error('No Railway token in RAILWAY_TOKEN env var');
  const res = await fetch(RAILWAY_GQL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${RAILWAY_TOKEN}`
    },
    body: JSON.stringify({ query, variables })
  });
  const j = await res.json();
  return j;
}

// helper: busca números dentro de un objeto recursivamente y devuelve todos los pares (clave -> valor)
function buscarNumeros(obj, prefix = '') {
  let found = {};
  if (obj == null) return found;
  if (typeof obj === 'number') {
    found[prefix || 'value'] = obj;
    return found;
  }
  if (typeof obj !== 'object') return found;
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'number') {
      found[key] = v;
    } else if (typeof v === 'object') {
      const res = buscarNumeros(v, key);
      Object.assign(found, res);
    }
  }
  return found;
}

// intenta ejecutar una serie de queries probables para extraer "total" y "remaining"
async function obtenerCreditosRailway() {
  if (!RAILWAY_TOKEN) return null;

  // lista de queries candidatos (intentos). Cada uno es un string GraphQL.
  const candidates = [
    // intento 1: campo "billing"
    `query { billing { currentUsage includedCredit remainingCredit } }`,
    // intento 2: estructura workspace/usage
    `query { workspace { usage { total included remaining } } }`,
    // intento 3: viewer -> account
    `query { viewer { account { balance remainingCredits usedCredits monthlyCredits } } }`,
    // intento 4: viewer -> billing
    `query { viewer { billing { total used remaining } } }`,
    // intento 5: generic 'credits' / 'creditBalance'
    `query { viewer { creditBalance } }`,
    // intento 6: try workspace usage edge
    `query { me: viewer { usage { cost } } }`
  ];

  for (const q of candidates) {
    try {
      const resp = await railwayQuery(q);
      if (resp && resp.data) {
        // Buscar números en toda la respuesta data
        const nums = buscarNumeros(resp.data);
        // Si encontramos al menos un número útil, devolvemos la respuesta cruda y los números
        if (Object.keys(nums).length > 0) {
          return { raw: resp.data, numbers: nums, usedQuery: q };
        }
      }
    } catch (err) {
      // ignora y sigue con el siguiente candidato
      // console.log('railway query error:', err.message);
    }
  }

  // si no se encontró nada útil
  return null;
}

// obtener total y restante intentando interpretar los resultados
async function calcularCreditos() {
  // intenta Railway
  const rr = await obtenerCreditosRailway().catch(() => null);
  if (!rr) {
    // fallback manual
    return {
      source: 'manual',
      total: obtenerTotalCreditoManual(),
      restante: obtenerCreditoRestanteManual(),
      raw: null
    };
  }

  // rr.numbers puede contener varios numeric fields; tratamos de encontrar "remaining" y "total-like"
  const nums = rr.numbers;
  // normalizar keys y valores
  // buscar por claves que contengan 'remain', 'left', 'remaining', 'remainingCredit', 'balance'
  const keyLower = Object.keys(nums).reduce((acc, k) => {
    acc[k.toLowerCase()] = nums[k];
    return acc;
  }, {});

  // heurística
  const prefer = (arr) => {
    for (const p of arr) {
      for (const k of Object.keys(keyLower)) {
        if (k.includes(p)) return keyLower[k];
      }
    }
    return null;
  };

  let restante = prefer(['remaining', 'remain', 'left', 'balance', 'available', 'remainingcredit']);
  let total = prefer(['total', 'included', 'includedcredit', 'credit', 'monthlycredits', 'balance']) || null;
  let usado = prefer(['used', 'usage', 'currentusage', 'cost']);

  // si no hay total pero hay usado y asumimos total manual
  if (restante == null && usado != null && total == null) {
    total = obtenerTotalCreditoManual();
    restante = Math.max(0, total - usado);
  }

  // si aún no hay restante ni total, fallback manual
  if (restante == null || total == null) {
    return {
      source: 'partial_api',
      total: obtenerTotalCreditoManual(),
      restante: obtenerCreditoRestanteManual(),
      raw: rr
    };
  }

  // aseguramos dos decimales
  return {
    source: 'api',
    total: Number(Number(total).toFixed(2)),
    restante: Number(Number(restante).toFixed(2)),
    raw: rr
  };
}

// ready
client.on('ready', async () => {
  console.log(`✅ Bot activo como ${client.user.tag}`);

  // obtener canal
  client.canal = client.channels.cache.get(CANAL_ID) || await client.channels.fetch(CANAL_ID).catch(() => null);

  // calcular créditos ahora
  const cred = await calcularCreditos().catch(() => null);
  const total = cred ? cred.total : obtenerTotalCreditoManual();
  const restante = cred ? cred.restante : obtenerCreditoRestanteManual();

  // mensaje de arranque
  const mensajeInicio = `<@&${ROL_ID}> ✅ El bot se ha encendido y está activo. Tengo ${formatoMoney(restante)} disponibles para gastar (Crédito total: ${formatoMoney(total)}).`;
  if (client.canal) client.canal.send(mensajeInicio).catch(() => console.log('No se pudo enviar mensaje de inicio.'));
  else console.log('No se encontró el canal para enviar el aviso de inicio.');

  // chequeo periódico cada minuto: avisos de baja y apagado
  setInterval(async () => {
    const c = await calcularCreditos().catch(() => null);
    const curRest = c ? c.restante : obtenerCreditoRestanteManual();

    // aviso cuando <= 0.10 (una vez)
    if (!avisoEnviadoBajo && curRest <= 0.10 && curRest > 0) {
      avisoEnviadoBajo = true;
      if (client.canal) {
        client.canal.send(`<@&${ROL_ID}> ⚠️ Atención: el bot se apagará pronto. Créditos restantes: ${formatoMoney(curRest)}.`).catch(() => {});
      }
    }

    // aviso cuando llegue a 0 (si no fue enviado)
    if (!avisoApagadoEnviado && curRest <= 0) {
      avisoApagadoEnviado = true;
      if (client.canal) {
        client.canal.send(`<@&${ROL_ID}> ⛔ El crédito ha llegado a $0. El bot se apagará ahora.`).catch(() => {});
      }
      // opcional: si quieres que el bot se cierre automáticamente, descomenta la línea de abajo:
      // process.exit(0);
    }
  }, 60 * 1000);
});

// mensajes (comandos)
client.on('message', async (msg) => {
  if (msg.author.bot) return;

  // !ping
  if (msg.content === '!ping') {
    const sent = await msg.channel.send('Calculando información...').catch(() => null);
    const latencyMessage = sent ? (sent.createdTimestamp - msg.createdTimestamp) : 'N/A';
    const latencyAPI = Math.round(client.ws.ping);

    // pedir créditos en tiempo real
    const cred = await calcularCreditos().catch(() => null);
    const total = cred ? cred.total : obtenerTotalCreditoManual();
    const restante = cred ? cred.restante : obtenerCreditoRestanteManual();

    // crear embed sin imagen, con avatar del autor
    const embed = new MessageEmbed()
      .setTitle('🏓 Info del bot & Créditos')
      .setColor('#0099ff')
      .addField('API (latencia)', `${latencyAPI} ms`, true)
      .addField('Mi Ping', `${latencyMessage} ms`, true)
      .addField('Crédito total (incluye +$1 mensual)', formatoMoney(total), false)
      .addField('Crédito restante', formatoMoney(restante), false)
      .setThumbnail(msg.author.displayAvatarURL({ dynamic: true, size: 64 })) // avatar tuyo
      .setFooter('Se reiniciará cuando tus créditos lleguen a 0.')
      .setTimestamp();

    if (sent) {
      sent.edit('', embed).catch(() => msg.channel.send(embed));
    } else {
      msg.channel.send(embed);
    }
  }

  // !testa - recordatorio/test de aviso
  else if (msg.content === '!testa') {
    const cred = await calcularCreditos().catch(() => null);
    const restante = cred ? cred.restante : obtenerCreditoRestanteManual();
    if (client.canal) {
      client.canal.send(`<@&${ROL_ID}> ⚠️ ¡Este es un test! El bot está activo y tengo ${formatoMoney(restante)} para gastar.`).catch(() => {});
      msg.reply('Test de recordatorio enviado.');
    } else {
      msg.reply('No se encontró el canal para enviar el test.');
    }
  }

  // !testr - test reinicio
  else if (msg.content === '!testr') {
    const cred = await calcularCreditos().catch(() => null);
    const restante = cred ? cred.restante : obtenerCreditoRestanteManual();
    if (client.canal) {
      client.canal.send(`<@&${ROL_ID}> ✅ ¡Test de reinicio! El bot está activo y tengo ${formatoMoney(restante)} para gastar.`).catch(() => {});
      msg.reply('Test de reinicio enviado.');
    } else {
      msg.reply('No se encontró el canal para enviar el test de reinicio.');
    }
  }

  // !help
  else if (msg.content === '!help') {
    const helpEmbed = new MessageEmbed()
      .setTitle('📖 Comandos disponibles')
      .setColor('#00AAFF')
      .setDescription('Lista de comandos y su descripción:')
      .addField('!ping', 'Muestra la latencia (API y tu ping) y créditos (total y restante).', false)
      .addField('!testa', 'Envía un test/recordatorio al canal configurado (hace ping al rol).', false)
      .addField('!testr', 'Envía un test de reinicio al canal configurado (hace ping al rol).', false)
      .setFooter('Usa los comandos con el prefijo "!".')
      .setTimestamp();
    msg.channel.send(helpEmbed);
  }
});

client.login(process.env.TOKEN);

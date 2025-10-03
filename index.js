// index.js (completo — Railway + avisos + Carnaval integrado)
// Requiere: node-fetch, discord.js v12.x
const { Client, MessageEmbed } = require('discord.js');
const fetch = require('node-fetch');

const client = new Client();

const CANAL_ID = '1401680611810476082'; // canal de avisos
const ROL_ID = '1390189325244829737';   // rol a pingear en avisos

// --- Respaldo manual (ajusta si quieres)
let baseCredito = 5.00;
const creditoMensual = 1.00;
let usadoCredito = 0.64;

// Endpoint GraphQL de Railway
const RAILWAY_GQL = 'https://backboard.railway.app/graphql/v2';
const RAILWAY_TOKEN = process.env.RAILWAY_TOKEN || null;

let avisoEnviadoBajo = false;
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

// GraphQL helper
async function railwayQuery(query, variables = {}) {
  if (!RAILWAY_TOKEN) throw new Error('No Railway token en RAILWAY_TOKEN');
  const res = await fetch(RAILWAY_GQL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${RAILWAY_TOKEN}`
    },
    body: JSON.stringify({ query, variables })
  });
  return await res.json();
}

// Buscar números en objeto recursivamente
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
      Object.assign(found, buscarNumeros(v, key));
    }
  }
  return found;
}

// Intentar queries Railway
async function obtenerCreditosRailway() {
  if (!RAILWAY_TOKEN) return null;
  const candidates = [
    `query { billing { currentUsage includedCredit remainingCredit } }`,
    `query { workspace { usage { total included remaining } } }`,
    `query { viewer { account { balance remainingCredits usedCredits monthlyCredits } } }`,
    `query { viewer { billing { total used remaining } } }`,
    `query { viewer { creditBalance } }`,
    `query { me: viewer { usage { cost } } }`
  ];
  for (const q of candidates) {
    try {
      const resp = await railwayQuery(q);
      if (resp && resp.data) {
        const nums = buscarNumeros(resp.data);
        if (Object.keys(nums).length > 0) {
          return { raw: resp.data, numbers: nums, usedQuery: q };
        }
      }
    } catch (err) {}
  }
  return null;
}

// Calcular créditos
async function calcularCreditos() {
  const rr = await obtenerCreditosRailway().catch(() => null);
  if (!rr) {
    return {
      source: 'manual',
      total: obtenerTotalCreditoManual(),
      restante: obtenerCreditoRestanteManual(),
      raw: null
    };
  }
  const nums = rr.numbers;
  const keyLower = Object.keys(nums).reduce((acc, k) => {
    acc[k.toLowerCase()] = nums[k];
    return acc;
  }, {});
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
  if (restante == null && usado != null && total == null) {
    total = obtenerTotalCreditoManual();
    restante = Math.max(0, total - usado);
  }
  if (restante == null || total == null) {
    return {
      source: 'partial_api',
      total: obtenerTotalCreditoManual(),
      restante: obtenerCreditoRestanteManual(),
      raw: rr
    };
  }
  return {
    source: 'api',
    total: Number(Number(total).toFixed(2)),
    restante: Number(Number(restante).toFixed(2)),
    raw: rr
  };
}

// ======================================================
// 📌 Carnaval integrado
// ======================================================
const TARGET_CHANNEL = '1390187635888095346'; 
const PING_USER_ID = '1003512479277662208';   
const TRIGGER_KEYWORDS = ['luna de sangre', 'sangre', 'luna'];
const TRIGGER_COMMAND = '!carnaval';

let carnavalActivo = false;
let carnavalTimer = null;

function buildCarnavalEmbed() {
  return new MessageEmbed()
    .setTitle('🌑 El clima de Luna de Sangre 🩸 está activo')
    .setDescription('*La luna carmesí ilumina la noche. Todo parece inquieto bajo su influjo oscuro.*')
    .addField('⏱️ Tiempo', '1 hora (recordatorio programado)', true)
    .addField('🚀 Mejora', 'El clima está en favor de la actividad **aventuras**.\nLa probabilidad de obtener items raros es mayor.', false)
    .addField('🎪 Carnaval', 'Usa `!pet adventure` para aprovechar el carnaval.', false)
    .setColor('#8B0000')
    .setFooter('Evento temporal — disfruta mientras dure')
    .setTimestamp()
    .setThumbnail('https://i.imgur.com/3V6H3bM.png');
}

async function sendCarnavalToChannel(channel) {
  if (!channel) return;
  if (carnavalActivo) return; // evita repeticiones

  carnavalActivo = true;
  try {
    await channel.send(`<@${PING_USER_ID}>`).catch(() => {});
    await channel.send(buildCarnavalEmbed()).catch(() => {});
  } catch (e) {}

  carnavalTimer = setTimeout(async () => {
    try {
      const remindEmbed = new MessageEmbed()
        .setTitle('⏲️ Recordatorio: Luna de Sangre (1h)')
        .setDescription('Ha pasado 1 hora desde que se activó la Luna de Sangre. Revisa el carnaval y aprovecha los últimos minutos.')
        .addField('Comando recomendado', '`!pet adventure`', true)
        .setColor('#550000')
        .setTimestamp();
      await channel.send(`<@${PING_USER_ID}>`).catch(() => {});
      await channel.send(remindEmbed).catch(() => {});
    } catch (e) {}
    carnavalActivo = false;
    carnavalTimer = null;
  }, 60 * 60 * 1000);
}

// ======================================================
// 📌 Evento Ready
// ======================================================
client.on('ready', async () => {
  console.log(`✅ Bot activo como ${client.user.tag}`);
  client.canal = client.channels.cache.get(CANAL_ID) || await client.channels.fetch(CANAL_ID).catch(() => null);
  const cred = await calcularCreditos().catch(() => null);
  const total = cred ? cred.total : obtenerTotalCreditoManual();
  const restante = cred ? cred.restante : obtenerCreditoRestanteManual();
  const mensajeInicio = `<@&${ROL_ID}> ✅ El bot se ha encendido. Tengo ${formatoMoney(restante)} disponibles (Crédito total: ${formatoMoney(total)}).`;
  if (client.canal) client.canal.send(mensajeInicio).catch(() => {});
  setInterval(async () => {
    const c = await calcularCreditos().catch(() => null);
    const curRest = c ? c.restante : obtenerCreditoRestanteManual();
    if (!avisoEnviadoBajo && curRest <= 0.10 && curRest > 0) {
      avisoEnviadoBajo = true;
      if (client.canal) client.canal.send(`<@&${ROL_ID}> ⚠️ Atención: créditos bajos (${formatoMoney(curRest)}).`).catch(() => {});
    }
    if (!avisoApagadoEnviado && curRest <= 0) {
      avisoApagadoEnviado = true;
      if (client.canal) client.canal.send(`<@&${ROL_ID}> ⛔ Crédito agotado. El bot se apagará.`).catch(() => {});
    }
  }, 60 * 1000);
});

// ======================================================
// 📌 Evento Message
// ======================================================
client.on('message', async (msg) => {
  if (!msg) return;

  // --- Carnaval manual ---
  if (msg.content && msg.content.trim().toLowerCase() === TRIGGER_COMMAND && !msg.author.bot) {
    const target = client.channels.cache.get(TARGET_CHANNEL) || await client.channels.fetch(TARGET_CHANNEL).catch(() => null);
    if (target) {
      await sendCarnavalToChannel(target);
      try { await msg.react('✅'); } catch (e) {}
    }
  }

  // --- Watcher carnaval ---
  if (msg.channel && msg.channel.id === TARGET_CHANNEL && msg.embeds && msg.embeds.length > 0) {
    const found = msg.embeds.some(e => {
      const title = (e.title || '').toLowerCase();
      const desc = (e.description || '').toLowerCase();
      const fields = (e.fields || []).map(f => (f.name + ' ' + f.value).toLowerCase()).join(' ');
      return TRIGGER_KEYWORDS.some(k => title.includes(k) || desc.includes(k) || fields.includes(k));
    });
    if (found) {
      await sendCarnavalToChannel(msg.channel);
    }
  }

  if (msg.author.bot) return;

  // !ping
  if (msg.content === '!ping') {
    const sent = await msg.channel.send('Calculando...').catch(() => null);
    const latencyMessage = sent ? (sent.createdTimestamp - msg.createdTimestamp) : 'N/A';
    const latencyAPI = Math.round(client.ws.ping);
    const cred = await calcularCreditos().catch(() => null);
    const total = cred ? cred.total : obtenerTotalCreditoManual();
    const restante = cred ? cred.restante : obtenerCreditoRestanteManual();
    const embed = new MessageEmbed()
      .setTitle('🏓 Info del bot & Créditos')
      .setColor('#0099ff')
      .addField('API (latencia)', `${latencyAPI} ms`, true)
      .addField('Mi Ping', `${latencyMessage} ms`, true)
      .addField('Crédito total', formatoMoney(total), false)
      .addField('Crédito restante', formatoMoney(restante), false)
      .setFooter('Se reiniciará cuando los créditos lleguen a 0.')
      .setTimestamp();
    if (sent) sent.edit('', embed).catch(() => msg.channel.send(embed));
    else msg.channel.send(embed);
    return;
  }

  if (msg.content === '!help') {
    const helpEmbed = new MessageEmbed()
      .setTitle('📖 Comandos disponibles')
      .setColor('#00AAFF')
      .setDescription('Lista de comandos:')
      .addField('!ping', 'Muestra latencia y créditos.', false)
      .addField('!carnaval', 'Activa el evento de Luna de Sangre manualmente.', false)
      .setTimestamp();
    msg.channel.send(helpEmbed);
    return;
  }
});

// ======================================================
// 📌 Login
// ======================================================
client.login(process.env.TOKEN);

// watcher.js
const { Client } = require('discord.js');
const stringSimilarity = require('string-similarity');

const client = new Client();
const TOKEN = "TU_TOKEN";
const TARGET_CHANNEL = "1390187635888095346";
const LOG_CHANNEL = "1424039114537308222";

const climatePhrases = {
  luna: [
    "luna de sangre",
    "la luna carmesí ilumina la noche",
    "todo parece inquieto bajo su influjo oscuro",
    "el cielo tiembla bajo la luna sangrienta"
  ],
  vientos: [
    "vientos embrujados",
    "el aire lleva susurros y carcajadas lejanas",
    "corrientes misteriosas guían a tu mascota",
    "se levantan vientos cargados de energía oscura"
  ],
  lluvia: [
    "lluvia maldita",
    "las gotas golpean el agua como conjuros",
    "una tormenta oscura cae sobre el mundo",
    "la lluvia trae consigo presagios sombríos"
  ],
  niebla: [
    "niebla oscura",
    "sombras extrañas se mueven bajo la superficie",
    "la niebla cubre todo con misterio",
    "formas ocultas se esconden en la neblina"
  ]
};

// 🔹 Detectar clima con similitud + búsqueda directa de nombre
function detectClimate(text) {
  text = text.toLowerCase();
  let bestClimate = "ninguno";
  let bestScore = 0;
  let detail = [];

  for (const [climate, phrases] of Object.entries(climatePhrases)) {
    for (const phrase of phrases) {
      const score = stringSimilarity.compareTwoStrings(text, phrase.toLowerCase());
      detail.push(`${climate} -> "${phrase}" ${(score * 100).toFixed(1)}%`);
      if (score > bestScore) {
        bestScore = score;
        bestClimate = climate;
      }
    }
  }

  // Si menciona directamente el nombre del clima → darle prioridad alta
  for (const climate of Object.keys(climatePhrases)) {
    if (text.includes(climate)) {
      bestClimate = climate;
      bestScore = Math.max(bestScore, 0.9); // 90% seguro
    }
  }

  return { bestClimate, bestScore, detail: detail.join("\n") };
}

// 🔹 Mandar log al canal
async function sendLog(client, payload) {
  try {
    const ch = client.channels.cache.get(LOG_CHANNEL) || await client.channels.fetch(LOG_CHANNEL).catch(() => null);
    if (!ch) return;
    const msg = 
`📩 **Mensaje analizado**
Canal origen: <#${TARGET_CHANNEL}>
Mensaje ID: ${payload.msgId}
Fuente: ${payload.source}

Texto analizado:
\`\`\`
${payload.text}
\`\`\`

Mejor coincidencia → ${payload.bestClimate} (${(payload.bestScore * 100).toFixed(1)}%)

Detalle por clima:
${payload.detail}`;
    await ch.send(msg);
  } catch (err) {
    console.error("Error enviando log:", err);
  }
}

client.on("message", async (msg) => {
  if (msg.channel.id !== TARGET_CHANNEL || msg.author.bot) return;
  const result = detectClimate(msg.content);
  await sendLog(client, {
    msgId: msg.id,
    source: `${msg.author.tag}`,
    text: msg.content.toLowerCase(),
    bestClimate: result.bestClimate,
    bestScore: result.bestScore,
    detail: result.detail
  });
});

client.login(TOKEN);
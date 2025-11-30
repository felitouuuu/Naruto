const { EmbedBuilder, SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const fetch = globalThis.fetch || require('node-fetch');
const { COINS } = require('../utils/cryptoUtils');

const COLORS = { main: '#6A0DAD', error: '#ED4245' };
const QUICKCHART_CREATE = 'https://quickchart.io/chart/create';
const MAX_POINTS = 240;
const CACHE_EXPIRY = 60 * 1000; // 60 segundos
const COOLDOWN = 10 * 1000; // 10 segundos

// Cache: { [key]: { embed, timestamp } }
const cache = {};
// Cooldowns: { [userId]: timestamp }
const cooldowns = {};

// Rangos permitidos
const RANGES = [
  { id: '1h', label: '📆 1h' },
  { id: '24h', label: '📆 24h' },
  { id: '7d', label: '📆 7d' },
  { id: '30d', label: '📆 30d' },
  { id: '365d', label: '📆 365d' },
  { id: 'max', label: '📆 Max' }
];

function money(n){ return n==null?'N/A':`$${Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`; }
function percent(n){ return n==null?'N/A':`${Number(n).toFixed(2)}%`; }
function resolveCoinId(input){ if(!input) return null; return COINS[input.toLowerCase()] || input.toLowerCase(); }

async function createQuickChartUrl(labels, values, title, color='rgb(106,13,173)'){
  const cfg = {
    type:'line',
    data:{ labels, datasets:[{ label:title, data:values, fill:true, borderColor:color, backgroundColor:color, pointRadius:0, tension:0.12 }] },
    options:{ plugins:{ legend:{display:false}, title:{display:true,text:title,font:{size:16}} }, scales:{ x:{display:false}, y:{ticks:{callback:v=>typeof v==='number'?`$${Number(v).toLocaleString()}`:v}} }, elements:{line:{borderWidth:2}} }
  };
  const res = await fetch(QUICKCHART_CREATE,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({ chart:cfg, backgroundColor:'transparent', width:1200, height:420 })
  });
  if(!res.ok) throw new Error(`QuickChart ${res.status}`);
  const json = await res.json();
  return json.url || null;
}

async function fetchMarketData(coinId, rangeId){
  const now = Math.floor(Date.now()/1000);
  if(rangeId==='1h'){
    const from = now-3600;
    const r = await fetch(`https://api.coingecko.com/api/v3/coins/${coinId}/market_chart/range?vs_currency=usd&from=${from}&to=${now}`);
    if(!r.ok) throw new Error(`CoinGecko ${r.status}`);
    const j = await r.json();
    if(!j.prices || !j.prices.length) return null;
    let prices = j.prices.map(p=>({t:p[0],v:p[1]}));
    if(prices.length>MAX_POINTS){ const step=Math.ceil(prices.length/MAX_POINTS); prices=prices.filter((_,i)=>i%step===0);}
    return prices;
  }
  let days = 1;
  if(rangeId==='max') days='max';
  else if(rangeId==='365d') days=365;
  else if(rangeId==='7d') days=7;
  else if(rangeId==='30d') days=30;
  else if(rangeId==='24h') days=1;

  const r = await fetch(`https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=${days}`);
  if(!r.ok) throw new Error(`CoinGecko ${r.status}`);
  const j = await r.json();
  if(!j.prices || !j.prices.length) return null;
  let prices = j.prices.map(p=>({t:p[0],v:p[1]}));
  if(prices.length>MAX_POINTS){ const step=Math.ceil(prices.length/MAX_POINTS); prices=prices.filter((_,i)=>i%step===0);}
  return prices;
}

async function fetchCoinSummary(coinId){
  const r = await fetch(`https://api.coingecko.com/api/v3/coins/${coinId}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`);
  if(!r.ok) throw new Error(`CoinGecko ${r.status}`);
  return r.json();
}

async function generateEmbed(symbol, coinId, rangeId){
  const cacheKey = `${symbol}:${rangeId}`;
  const now = Date.now();
  if(cache[cacheKey] && (now - cache[cacheKey].timestamp < CACHE_EXPIRY)) return cache[cacheKey].embed;

  const prices = await fetchMarketData(coinId, rangeId);
  if(!prices || !prices.length) return null;

  let summary = null;
  try{ summary = await fetchCoinSummary(coinId); }catch{}

  const labels = prices.map(p=>{ const d=new Date(p.t); return `${d.toLocaleDateString('en-US')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; });
  const values = prices.map(p=>Number(p.v));
  const first = values[0], last = values[values.length-1], changePct = first?((last-first)/first*100):0;
  const chartUrl = await createQuickChartUrl(labels, values.map(v=>Number(v.toFixed(8))), `${symbol.toUpperCase()} · ${money(last)} · ${Number(changePct).toFixed(2)}%`);

  const embed = new EmbedBuilder()
    .setTitle(`${symbol.toUpperCase()} — ${RANGES.find(r=>r.id===rangeId)?.label||rangeId}`)
    .setDescription(`Último: **${money(last)}** • Cambio: **${Number(changePct).toFixed(2)}%**`)
    .setColor(COLORS.main)
    .setImage(chartUrl)
    .setTimestamp();

  if(summary?.market_data){
    const md = summary.market_data;
    embed.addFields(
      { name:'Market cap', value: md.market_cap?.usd?money(md.market_cap.usd):'N/A', inline:true },
      { name:'Volume 24h', value: md.total_volume?.usd?money(md.total_volume.usd):'N/A', inline:true },
      { name:'Price', value: md.current_price?.usd?money(md.current_price.usd):'N/A', inline:true },
      { name:'ATH', value: md.ath?.usd?money(md.ath.usd):'N/A', inline:true },
      { name:'ATL', value: md.atl?.usd?money(md.atl.usd):'N/A', inline:true }
    );
    if(summary.image?.large) embed.setThumbnail(summary.image.large);
    embed.setFooter({ text:'Data from CoinGecko.com' });
  }else{
    embed.addFields({ name:'Fuente', value:'CoinGecko (resumen no disponible)', inline:true });
  }

  cache[cacheKey] = { embed, timestamp: now };
  return embed;
}

// Menu desplegable
function buildSelectMenu(symbol){
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`cryptochart_select:${symbol}`)
    .setPlaceholder('Selecciona rango')
    .addOptions(RANGES.map(r=>({label:r.label,value:r.id})))
    .setMinValues(1)
    .setMaxValues(1);
  return [ new ActionRowBuilder().addComponents(menu) ];
}

// Cooldown check (solo para el comando, no para el select)
function checkCooldown(userId){
  const now = Date.now();
  if(cooldowns[userId] && (now - cooldowns[userId] < COOLDOWN)){
    return COOLDOWN - (now - cooldowns[userId]);
  }
  cooldowns[userId] = now;
  return 0;
}

module.exports = {
  name:'cryptochart',
  description:'Muestra gráfica y métricas de una moneda (menú de rangos)',
  category:'Criptos',
  syntax:'!cryptochart <moneda>',
  ejemplo:'cryptochart btc',

  data: new SlashCommandBuilder()
    .setName('cryptochart')
    .setDescription('Muestra gráfica de precio con rangos')
    .addStringOption(opt=>opt.setName('moneda').setDescription('btc, eth, sol, bnb, xrp, doge').setRequired(true)),

  async executeMessage(msg, args){
    const remainingMs = checkCooldown(msg.author.id);
    if(remainingMs > 0){
      const unlockTime = Math.floor((Date.now() + remainingMs)/1000);
      const embed = new EmbedBuilder()
        .setTitle('Whoo! Vas muy rápido')
        .setDescription(`Podrás volver a ejecutar este comando <t:${unlockTime}:R>.`)
        .setColor(COLORS.error);
      return msg.reply({ embeds:[embed] });
    }

    const raw = (args[0]||'').toLowerCase();
    if(!raw) return msg.reply({ content:'Debes indicar una moneda.' });
    const coinId = resolveCoinId(raw);
    const embed = await generateEmbed(raw, coinId, '24h');
    if(!embed) return msg.reply({ content:'No pude generar la gráfica.' });
    const row = buildSelectMenu(raw);
    await msg.channel.send({ embeds:[embed], components:row });
  },

  async executeInteraction(interaction){
    const remainingMs = checkCooldown(interaction.user.id);
    if(remainingMs > 0){
      const unlockTime = Math.floor((Date.now() + remainingMs)/1000);
      const embed = new EmbedBuilder()
        .setTitle('Whoo! Vas muy rápido')
        .setDescription(`Podrás volver a ejecutar este comando <t:${unlockTime}:R>.`)
        .setColor(COLORS.error);
      return interaction.reply({ embeds:[embed], ephemeral:true });
    }

    const raw = (interaction.options.getString('moneda')||'').toLowerCase();
    if(!raw) return interaction.reply({ content:'Debes indicar una moneda.', ephemeral:true });
    const coinId = resolveCoinId(raw);
    const embed = await generateEmbed(raw, coinId, '24h');
    if(!embed) return interaction.reply({ content:'No pude generar la gráfica.', ephemeral:true });
    const row = buildSelectMenu(raw);
    return interaction.reply({ embeds:[embed], components:row });
  },

  async handleInteraction(interaction){
    if(!interaction.isStringSelectMenu()) return;
    if(!interaction.customId.startsWith('cryptochart_select:')) return;

    // **Quitar cooldown para el select menu**: no comprobamos ni aplicamos cooldown aquí.
    const symbol = interaction.customId.split(':')[1];
    const rangeId = interaction.values[0];
    const coinId = resolveCoinId(symbol);
    const embed = await generateEmbed(symbol, coinId, rangeId);
    if(!embed) return interaction.update({ content:'No pude generar la gráfica.', components:[], embeds:[] });
    const row = buildSelectMenu(symbol);
    return interaction.update({ embeds:[embed], components:row });
  }
};

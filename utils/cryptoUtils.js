// utils/cryptoUtils.js
const fetch = require('node-fetch');

const API_KEY = process.env.COINGECKO_API_KEY || '';
const API_MODE = (process.env.COINGECKO_API_MODE || '').toLowerCase(); // 'demo'|'pro'|''

const COINS = {
  btc: 'bitcoin',
  eth: 'ethereum',
  bnb: 'binancecoin',
  sol: 'solana',
  xrp: 'ripple',
  doge: 'dogecoin'
};

function buildRequest(id) {
  if (API_MODE === 'pro') {
    return {
      url: `https://pro-api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd&include_24hr_change=true&include_last_updated_at=true`,
      headers: { 'x-cg-pro-api-key': API_KEY }
    };
  }
  // demo/public
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd&include_24hr_change=true&include_last_updated_at=true${API_KEY ? `&x_cg_demo_api_key=${API_KEY}` : ''}`;
  return { url, headers: {} };
}

/**
 * getCryptoPrice(symbolOrId)
 * - acepta: 'btc', 'eth' o 'bitcoin', 'ethereum'
 * - retorna: { price, change24h, lastUpdatedAt } o null en error/no-datos
 */
async function getCryptoPrice(symbolOrId) {
  try {
    if (!symbolOrId) return null;
    const key = String(symbolOrId).toLowerCase();
    const id = COINS[key] || key; // si es 'btc' -> 'bitcoin', si es 'bitcoin' queda 'bitcoin'

    const { url, headers } = buildRequest(id);
    const res = await fetch(url, { headers });

    if (!res.ok) {
      console.error(`CoinGecko responded ${res.status} for id=${id}`);
      return null;
    }

    const json = await res.json();
    const o = json[id];
    if (!o) return null;

    return {
      price: typeof o.usd === 'number' ? o.usd : Number(o.usd) || null,
      change24h: typeof o.usd_24h_change === 'number' ? o.usd_24h_change : Number(o.usd_24h_change) || 0,
      lastUpdatedAt: o.last_updated_at || null
    };
  } catch (err) {
    console.error('getCryptoPrice error:', err);
    return null;
  }
}

module.exports = { getCryptoPrice, COINS };
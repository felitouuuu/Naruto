const fetch = require('node-fetch');

const API_KEY = process.env.COINGECKO_API_KEY;
const API_MODE = process.env.COINGECKO_API_MODE || 'demo';

const COINS = {
  btc: 'bitcoin',
  eth: 'ethereum',
  bnb: 'binancecoin',
  sol: 'solana',
  xrp: 'ripple',
  doge: 'dogecoin'
};

function buildURL(id) {
  if (API_MODE === 'pro') {
    // PRO → API KEY VA EN HEADERS
    return {
      url: `https://pro-api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`,
      headers: { 'x-cg-pro-api-key': API_KEY }
    };
  }

  // DEMO → API KEY VA EN LA URL
  return {
    url: `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd&x_cg_demo_api_key=${API_KEY}`,
    headers: {}
  };
}

async function getPrice(symbol) {
  const id = COINS[symbol.toLowerCase()];
  if (!id) return null;

  try {
    const { url, headers } = buildURL(id);

    const res = await fetch(url, { headers });
    const data = await res.json();

    return data[id]?.usd || null;
  } catch (err) {
    return null;
  }
}

module.exports = { getPrice, COINS };

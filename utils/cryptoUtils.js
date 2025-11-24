// utils/cryptoUtils.js
const fetch = require('node-fetch');

async function getCryptoPrice(symbol) {
    try {
        const apiUrl = `https://api.coingecko.com/api/v3/simple/price?ids=${symbol}&vs_currencies=usd&include_24hr_change=true`;

        const response = await fetch(apiUrl, {
            headers: {
                'x-cg-demo-api-key': process.env.COINGECKO_API_KEY
            }
        });

        if (!response.ok) {
            console.error("Error en la API:", response.status);
            return null;
        }

        const data = await response.json();

        if (!data[symbol]) {
            return null;
        }

        return {
            price: data[symbol].usd,
            change24h: data[symbol].usd_24h_change
        };

    } catch (err) {
        console.error("Error obteniendo precio:", err);
        return null;
    }
}

module.exports = {
    getCryptoPrice
};

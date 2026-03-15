import { getJsonBinData, jsonResponse } from './_utils.js';

export async function onRequestGet({ env }) {
    const data = await getJsonBinData(env.JSONBIN_API_KEY);
    return jsonResponse({
        enabled: data.config?.enabled !== false,
        totalGifts: data.gifts.length,
        remainingGifts: data.gifts.filter(g => g.claimed === 0).length
    });
}

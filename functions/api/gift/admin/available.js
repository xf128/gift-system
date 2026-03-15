import { getJsonBinData, isAdmin, errorResponse, jsonResponse } from '../_utils.js';

export async function onRequestGet({ request, env }) {
    if (!isAdmin(request, env)) return errorResponse('未授权', 401);

    const data = await getJsonBinData(env.JSONBIN_API_KEY);
    const available = data.gifts.filter(g => g.claimed === 0);
    
    return jsonResponse(available);
}

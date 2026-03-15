import { getJsonBinData, isAdmin, errorResponse, jsonResponse } from '../_utils.js';

export async function onRequestGet({ request, env }) {
    if (!isAdmin(request, env)) return errorResponse('未授权', 401);

    const data = await getJsonBinData(env.JSONBIN_API_KEY);
    
    // Masking email in records for display if needed, but since this is admin, return full info
    return jsonResponse({
        total: data.gifts.length,
        claimedCount: data.records.length,
        enabled: data.config?.enabled !== false,
        records: data.records
    });
}

import { getJsonBinData, saveJsonBinData, isAdmin, errorResponse, jsonResponse } from '../_utils.js';

export async function onRequestPost({ request, env }) {
    if (!isAdmin(request, env)) return errorResponse('未授权', 401);

    const data = await getJsonBinData(env.JSONBIN_API_KEY);
    const config = data.config || { enabled: true };
    
    // Clear everything but keep config
    const newData = { gifts: [], records: [], config };

    const ok = await saveJsonBinData(env.JSONBIN_API_KEY, newData);
    return jsonResponse({ success: ok });
}

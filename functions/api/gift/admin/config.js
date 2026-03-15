import { getJsonBinData, saveJsonBinData, isAdmin, errorResponse, jsonResponse } from '../_utils.js';

export async function onRequestPost({ request, env }) {
    if (!isAdmin(request, env)) return errorResponse('未授权', 401);

    const { enabled } = await request.json();
    const data = await getJsonBinData(env.JSONBIN_API_KEY);
    
    if (!data.config) data.config = {};
    data.config.enabled = enabled;

    const ok = await saveJsonBinData(env.JSONBIN_API_KEY, data);
    return jsonResponse({ success: ok });
}

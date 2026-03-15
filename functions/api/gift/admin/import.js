import { getJsonBinData, saveJsonBinData, isAdmin, errorResponse, jsonResponse } from '../_utils.js';

export async function onRequestPost({ request, env }) {
    if (!isAdmin(request, env)) return errorResponse('未授权', 401);

    const { gifts } = await request.json();
    const data = await getJsonBinData(env.JSONBIN_API_KEY);
    
    gifts.forEach(g => {
        data.gifts.push({ name: g.name, code: g.code, claimed: 0 });
    });

    const ok = await saveJsonBinData(env.JSONBIN_API_KEY, data);
    return jsonResponse({ success: ok });
}

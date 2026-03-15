const JSONBIN_BIN_ID = '6986d11fd0ea881f40a72fb3';
const JSONBIN_BASE_URL = `https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}`;

// Utility to get data from JSONbin
export async function getJsonBinData(apiKey) {
    const res = await fetch(JSONBIN_BASE_URL, {
        headers: { 'X-Master-Key': apiKey }
    });
    const result = await res.json();
    return result.record || { gifts: [], records: [], config: { enabled: true } };
}

// Utility to save data to JSONbin
export async function saveJsonBinData(apiKey, data) {
    const res = await fetch(JSONBIN_BASE_URL, {
        method: 'PUT',
        headers: { 
            'Content-Type': 'application/json',
            'X-Master-Key': apiKey 
        },
        body: JSON.stringify(data)
    });
    return res.ok;
}

// Error response helper
export function errorResponse(msg, status = 400) {
    return new Response(JSON.stringify({ error: msg }), { 
        status, 
        headers: { 'Content-Type': 'application/json' } 
    });
}

// JSON response helper
export function jsonResponse(data) {
    return new Response(JSON.stringify(data), { 
        headers: { 'Content-Type': 'application/json' } 
    });
}

// Simple Admin check - token from environment variable
export function isAdmin(request, env) {
    const auth = request.headers.get('Authorization');
    const adminToken = env.ADMIN_TOKEN || 'ai2024'; // Fallback for backward compatibility
    return auth === `Bearer ${adminToken}`;
}

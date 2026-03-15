import { getJsonBinData, errorResponse, jsonResponse } from './_utils.js';

// Constants
const CODE_EXPIRY_MS = 600000; // 10 minutes
const RATE_LIMIT_MS = 60000;   // 60 seconds
const EMAIL_DOMAIN = '@gd.chinamobile.com';

// Validate email with stronger regex
function isValidEmail(email) {
    if (!email || typeof email !== 'string') return false;
    const normalized = email.trim().toLowerCase();
    const regex = new RegExp(`^[a-zA-Z0-9._%+-]+${EMAIL_DOMAIN.replace('.', '\\.')}$`, 'i');
    return regex.test(normalized);
}

// Sanitize error message
function sanitizeError(errText) {
    if (!errText) return '服务暂时不可用';
    // Remove potential sensitive info
    return '邮件发送失败，请稍后重试';
}

export async function onRequestPost({ request, env }) {
    const { email } = await request.json();
    
    // Validate email with stricter check
    const normalizedEmail = email?.trim()?.toLowerCase();
    if (!isValidEmail(normalizedEmail)) {
        return errorResponse('无效的邮箱地址');
    }

    // Rate limiting: check if code was sent recently
    // Note: Uses expires_at as proxy for recent send if created_at not available
    if (env.DB) {
        const recent = await env.DB.prepare(
            "SELECT expires_at FROM gift_codes WHERE email = ? LIMIT 1"
        ).bind(normalizedEmail).first();
        
        // If there's a code that expires in more than 9 minutes (sent less than 1 min ago)
        if (recent && recent.expires_at) {
            const timeUntilExpiry = recent.expires_at - Date.now();
            if (timeUntilExpiry > CODE_EXPIRY_MS - RATE_LIMIT_MS) {
                const remainSec = Math.ceil((RATE_LIMIT_MS - (CODE_EXPIRY_MS - timeUntilExpiry)) / 1000);
                return errorResponse(`发送过于频繁，请 ${Math.max(1, remainSec)} 秒后再试`);
            }
        }
    }

    const data = await getJsonBinData(env.JSONBIN_API_KEY);
    
    // Check if system is enabled
    if (data.config?.enabled === false) {
        return errorResponse('未到开放时间', 403);
    }

    // Check if already claimed
    if (data.records.some(r => r.email.toLowerCase() === normalizedEmail)) {
        return errorResponse('该邮箱已领取过，每人限领一次');
    }

    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Store code in SQLite (expires_at in milliseconds)
    if (env.DB) {
        await env.DB.prepare(`
            INSERT OR REPLACE INTO gift_codes (email, code, expires_at)
            VALUES (?, ?, ?)
        `).bind(normalizedEmail, code, Date.now() + CODE_EXPIRY_MS).run();
    }

    // Call EmailJS from backend
    // Added Origin header to simulate browser request
    const emailRes = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Origin': 'https://gift-9cr.pages.dev' 
        },
        body: JSON.stringify({
            service_id: env.EMAILJS_SERVICE_ID,
            template_id: env.EMAILJS_TEMPLATE_ID,
            user_id: env.EMAILJS_PUBLIC_KEY,
            accessToken: env.EMAILJS_PRIVATE_KEY,
            template_params: {
                to_email: normalizedEmail,
                code: code
            }
        })
    });

    if (!emailRes.ok) {
        // Sanitize error message - don't leak internal details
        return errorResponse(sanitizeError(await emailRes.text()));
    }

    return jsonResponse({ success: true, msg: '验证码已发送' });
}

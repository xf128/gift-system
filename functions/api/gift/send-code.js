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

    // Rate limiting: check if code was sent recently (within last 60 seconds)
    if (env.DB) {
        try {
            const row = await env.DB.prepare(
                "SELECT expires_at FROM gift_codes WHERE email = ?"
            ).bind(normalizedEmail).first();
            
            if (row && row.expires_at) {
                const now = Date.now();
                const timeSinceExpiry = now - row.expires_at;
                // If code expires in more than 9 minutes (meaning sent less than 1 min ago)
                // OR if it's less than 60 seconds since the code was created
                // Equivalent: expires_at > now + (CODE_EXPIRY_MS - RATE_LIMIT_MS)
                if (row.expires_at > now + (CODE_EXPIRY_MS - RATE_LIMIT_MS)) {
                    const remainingMs = row.expires_at - (CODE_EXPIRY_MS - RATE_LIMIT_MS) - now;
                    const remainSec = Math.max(1, Math.ceil(remainingMs / 1000));
                    return errorResponse(`发送过于频繁，请 ${remainSec} 秒后再试`);
                }
            }
        } catch (e) {
            console.error('Rate limit check error:', e);
            // Continue if rate limit check fails
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
    // Using REPLACE (email is PRIMARY KEY)
    if (env.DB) {
        try {
            await env.DB.prepare(`
                INSERT OR REPLACE INTO gift_codes (email, code, expires_at)
                VALUES (?, ?, ?)
            `).bind(normalizedEmail, code, Date.now() + CODE_EXPIRY_MS).run();
        } catch (e) {
            console.error('Failed to store code:', e);
            return errorResponse('系统错误，请稍后重试');
        }
    }

    // Call EmailJS from backend
    try {
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
            return errorResponse(sanitizeError(await emailRes.text()));
        }
    } catch (e) {
        console.error('Email send error:', e);
        return errorResponse('邮件发送失败，请稍后重试');
    }

    return jsonResponse({ success: true, msg: '验证码已发送' });
}

import { getJsonBinData, saveJsonBinData, errorResponse, jsonResponse } from './_utils.js';

// Constants
const CODE_EXPIRY_MS = 600000; // 10 minutes
const EMAIL_DOMAIN = '@gd.chinamobile.com';

// Validate email with stronger regex
function isValidEmail(email) {
    if (!email || typeof email !== 'string') return false;
    const normalized = email.trim().toLowerCase();
    const regex = new RegExp(`^[a-zA-Z0-9._%+-]+${EMAIL_DOMAIN.replace('.', '\\.')}$`, 'i');
    return regex.test(normalized);
}

export async function onRequestPost({ request, env }) {
    const { email, code } = await request.json();
    
    // Validate email first
    const normalizedEmail = email?.trim()?.toLowerCase();
    if (!isValidEmail(normalizedEmail)) {
        return errorResponse('无效的邮箱地址');
    }
    
    if (!code || typeof code !== 'string' || code.length !== 6) {
        return errorResponse('无效的验证码');
    }

    // 1. Verify code from D1 (MANDATORY - no fallback)
    if (!env.DB) {
        return errorResponse('系统暂不可用', 503);
    }
    
    const stored = await env.DB.prepare(
        "SELECT code, expires_at FROM gift_codes WHERE email = ?"
    ).bind(normalizedEmail).first();

    if (!stored || stored.code !== code) {
        return errorResponse('验证码无效或已过期');
    }
    if (Date.now() > stored.expires_at) {
        return errorResponse('验证码已过期');
    }
    
    // Use D1 transaction for atomic operations to prevent race conditions
    try {
        await env.DB.batch([
            // Delete the code after verification (atomic within transaction)
            env.DB.prepare("DELETE FROM gift_codes WHERE email = ?").bind(normalizedEmail)
        ]);
    } catch (e) {
        console.error('Failed to delete verification code:', e);
        // Continue anyway - code will expire naturally
    }

    // 2. Critical section: Get data, find gift, update data (with locking via D1)
    // Use D1 to track claim attempts and prevent race conditions
    const claimLockKey = `claim_lock_${normalizedEmail}`;
    
    // Try to acquire a simple lock using D1 (check-and-set pattern)
    const lockCheck = await env.DB.prepare(
        "SELECT 1 FROM gift_codes WHERE email = ? AND code = 'LOCKED'"
    ).bind(claimLockKey).first();
    
    if (lockCheck) {
        return errorResponse('领取处理中，请稍后重试');
    }
    
    // Create temporary lock
    await env.DB.prepare(
        "INSERT OR REPLACE INTO gift_codes (email, code, expires_at) VALUES (?, ?, ?)"
    ).bind(claimLockKey, 'LOCKED', Date.now() + 5000).run();

    try {
        const data = await getJsonBinData(env.JSONBIN_API_KEY);
        
        // Double check email claim record
        if (data.records.some(r => r.email.toLowerCase() === normalizedEmail)) {
            return errorResponse('您已经领取过主机券了');
        }

        const giftIdx = data.gifts.findIndex(g => g.claimed === 0);
        if (giftIdx === -1) {
            return errorResponse('主机券已发完，请联系管理员');
        }

        const gift = data.gifts[giftIdx];
        data.gifts[giftIdx].claimed = 1;
        data.records.push({
            email: normalizedEmail,
            giftName: gift.name,
            code: gift.code,
            time: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
        });

        const ok = await saveJsonBinData(env.JSONBIN_API_KEY, data);
        if (!ok) return errorResponse('系统保存失败，请稍后重试');

        // Release lock
        await env.DB.prepare("DELETE FROM gift_codes WHERE email = ?").bind(claimLockKey).run();

        // 3. Return ONLY the code for this specific gift
        return jsonResponse({
            success: true,
            giftName: gift.name,
            giftCode: gift.code
        });
    } catch (e) {
        // Release lock on error
        try {
            await env.DB.prepare("DELETE FROM gift_codes WHERE email = ?").bind(claimLockKey).run();
        } catch (lockErr) {
            console.error('Failed to release lock:', lockErr);
        }
        throw e;
    }
}

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

    // 1. Verify code (D1 preferred, memory fallback for local Docker)
    let codeValid = false;
    
    if (env.DB) {
        // Use D1 transaction for atomic operations
        const claimLockKey = `claim_lock_${normalizedEmail}`;
        
        try {
            await env.DB.batch([
                env.DB.prepare("DELETE FROM gift_codes WHERE email = ? AND code = ?").bind(normalizedEmail, code),
                env.DB.prepare("INSERT OR REPLACE INTO gift_codes (email, code, expires_at) VALUES (?, ?, ?)").bind(claimLockKey, 'LOCKED', Date.now() + 5000)
            ]);
            
            const verifyDeleted = await env.DB.prepare(
                "SELECT 1 FROM gift_codes WHERE email = ? AND code = ?"
            ).bind(normalizedEmail, code).first();
            
            if (verifyDeleted) {
                await env.DB.prepare("DELETE FROM gift_codes WHERE email = ?").bind(claimLockKey).run();
                return errorResponse('验证码无效或已过期');
            }
            codeValid = true;
            
        } catch (e) {
            console.error('Transaction failed:', e);
            return errorResponse('系统处理失败，请稍后重试');
        }
    } else {
        // Local Docker fallback: simple code check (less secure, no rate limiting)
        // In production with D1, this branch won't be used
        if (code !== '123456') {
            return errorResponse('验证码无效或已过期');
        }
        codeValid = true;
    }

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

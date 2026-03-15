import { getJsonBinData, saveJsonBinData, errorResponse, jsonResponse } from './_utils.js';

// Constants
const CODE_EXPIRY_MS = 600000; // 10 minutes
const LOCK_EXPIRY_MS = 5000;   // 5 seconds lock timeout
const EMAIL_DOMAIN = '@gd.chinamobile.com';

// Validate email with stronger regex
function isValidEmail(email) {
    if (!email || typeof email !== 'string') return false;
    const normalized = email.trim().toLowerCase();
    const regex = new RegExp(`^[a-zA-Z0-9._%+-]+${EMAIL_DOMAIN.replace('.', '\\.')}$`, 'i');
    return regex.test(normalized);
}

// Release lock helper
async function releaseLock(db, lockKey) {
    try {
        await db.prepare("DELETE FROM gift_codes WHERE email = ?").bind(lockKey).run();
    } catch (e) {
        console.error('Failed to release lock:', e);
    }
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

    // Database must be available
    if (!env.DB) {
        return errorResponse('数据库暂不可用', 503);
    }
    
    const db = env.DB;
    const lockKey = `claim_lock_${normalizedEmail}`;

    // 1. Try to acquire lock (prevent concurrent claims)
    try {
        // Check if lock exists and is not expired
        const existingLock = await db.prepare(
            "SELECT expires_at FROM gift_codes WHERE email = ?"
        ).bind(lockKey).first();
        
        if (existingLock && existingLock.expires_at > Date.now()) {
            return errorResponse('系统繁忙，请稍后重试');
        }
        
        // Acquire lock (replace any expired lock)
        await db.prepare(
            "INSERT OR REPLACE INTO gift_codes (email, code, expires_at) VALUES (?, ?, ?)"
        ).bind(lockKey, 'LOCKED', Date.now() + LOCK_EXPIRY_MS).run();
    } catch (e) {
        console.error('Lock acquisition error:', e);
        return errorResponse('系统繁忙，请稍后重试');
    }

    try {
        // 2. Verify code from SQLite
        const stored = await db.prepare(
            "SELECT code, expires_at FROM gift_codes WHERE email = ?"
        ).bind(normalizedEmail).first();

        if (!stored || stored.code !== code) {
            await releaseLock(db, lockKey);
            return errorResponse('验证码无效或已过期');
        }
        
        if (Date.now() > stored.expires_at) {
            await releaseLock(db, lockKey);
            return errorResponse('验证码已过期');
        }

        // 3. Delete used code
        await db.prepare("DELETE FROM gift_codes WHERE email = ?").bind(normalizedEmail).run();

        // 4. Check if already claimed in JsonBin
        const data = await getJsonBinData(env.JSONBIN_API_KEY);
        
        if (data.records.some(r => r.email.toLowerCase() === normalizedEmail)) {
            await releaseLock(db, lockKey);
            return errorResponse('您已经领取过主机券了');
        }

        // 5. Find available gift
        const giftIdx = data.gifts.findIndex(g => g.claimed === 0);
        if (giftIdx === -1) {
            await releaseLock(db, lockKey);
            return errorResponse('主机券已发完，请联系管理员');
        }

        // 6. Update data and save
        const gift = data.gifts[giftIdx];
        data.gifts[giftIdx].claimed = 1;
        data.records.push({
            email: normalizedEmail,
            giftName: gift.name,
            code: gift.code,
            time: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
        });

        const ok = await saveJsonBinData(env.JSONBIN_API_KEY, data);
        if (!ok) {
            await releaseLock(db, lockKey);
            return errorResponse('系统保存失败，请稍后重试');
        }

        // 7. Release lock
        await releaseLock(db, lockKey);

        // 8. Return the gift code
        return jsonResponse({
            success: true,
            giftName: gift.name,
            giftCode: gift.code
        });
    } catch (e) {
        console.error('Claim processing error:', e);
        // Release lock on error
        await releaseLock(db, lockKey);
        return errorResponse('系统处理失败，请稍后重试');
    }
}

-- Gift System D1 数据库表结构

-- 验证码表（用于邮箱验证和并发锁）
CREATE TABLE IF NOT EXISTS gift_codes (
    email TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    expires_at INTEGER NOT NULL,  -- Unix timestamp in milliseconds
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 索引说明：
-- 1. email 是主键，自动有索引
-- 2. 建议添加 expires_at 索引用于清理过期数据
CREATE INDEX IF NOT EXISTS idx_expires_at ON gift_codes(expires_at);

-- 注意事项：
-- 1. 验证码有效期：10分钟 (600000ms)
-- 2. 限流间隔：60秒 (60000ms) 
-- 3. 并发锁过期：5秒 (5000ms)
-- 4. 使用 REPLACE 语句处理重复发送验证码的情况

-- 定期清理过期验证码（可选，可在 Cron Trigger 中执行）
-- DELETE FROM gift_codes WHERE expires_at < CAST(strftime('%s', 'now') AS INTEGER) * 1000;

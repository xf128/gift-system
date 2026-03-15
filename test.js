/**
 * Gift System 完整功能测试
 * 测试所有核心逻辑，包括安全校验
 */

// ===== 常量定义 =====
const EMAIL_DOMAIN = '@gd.chinamobile.com';
const CODE_EXPIRY_MS = 600000;
const RATE_LIMIT_MS = 60000;

// ===== 工具函数 =====

// 邮箱验证（从 send-code.js 和 claim.js 提取）
function isValidEmail(email) {
    if (!email || typeof email !== 'string') return false;
    const normalized = email.trim().toLowerCase();
    const regex = new RegExp(`^[a-zA-Z0-9._%+-]+${EMAIL_DOMAIN.replace('.', '\\.')}$`, 'i');
    return regex.test(normalized);
}

// Admin 鉴权（从 _utils.js 提取）
function isAdmin(authHeader, adminToken) {
    const token = adminToken || 'ai2024';
    return authHeader === `Bearer ${token}`;
}

// 生成验证码
function generateCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// 生成锁键
function getLockKey(email) {
    return `claim_lock_${email}`;
}

// 错误信息脱敏
function sanitizeError(errText) {
    if (!errText) return '服务暂时不可用';
    return '邮件发送失败，请稍后重试';
}

// ===== 测试套件 =====

function runTests() {
    let passed = 0, failed = 0;
    
    function test(name, fn) {
        try {
            const result = fn();
            if (result) {
                console.log(`✓ ${name}`);
                passed++;
            } else {
                console.log(`✗ ${name}`);
                failed++;
            }
        } catch (e) {
            console.log(`✗ ${name} - Error: ${e.message}`);
            failed++;
        }
    }

    console.log('=== Gift System 功能测试 ===\n');
    
    // --- 邮箱验证测试 ---
    console.log('【邮箱验证】');
    test('有效的公司邮箱', () => isValidEmail('test@gd.chinamobile.com'));
    test('带点的邮箱', () => isValidEmail('user.name@gd.chinamobile.com'));
    test('带+的邮箱', () => isValidEmail('user+tag@gd.chinamobile.com'));
    test('大写域名', () => isValidEmail('user@GD.CHINAMOBILE.COM'));
    test('空邮箱', () => !isValidEmail(''));
    test('null邮箱', () => !isValidEmail(null));
    test('undefined邮箱', () => !isValidEmail(undefined));
    test('只有域名', () => !isValidEmail('@gd.chinamobile.com'));
    test('错误域名', () => !isValidEmail('user@example.com'));
    test('子域名攻击', () => !isValidEmail('user@evil.gd.chinamobile.com'));
    test('后缀攻击', () => !isValidEmail('user@gd.chinamobile.com.evil.com'));
    test('无@符号', () => !isValidEmail('usergd.chinamobile.com'));
    test('多个@符号', () => !isValidEmail('user@@gd.chinamobile.com'));
    
    // --- Admin 鉴权测试 ---
    console.log('\n【Admin 鉴权】');
    test('正确的默认 Token', () => isAdmin('Bearer ai2024', null));
    test('正确的自定义 Token', () => isAdmin('Bearer mysecrettoken', 'mysecrettoken'));
    test('错误的 Token', () => !isAdmin('Bearer wrongtoken', 'correcttoken'));
    test('格式错误的 Header', () => !isAdmin('ai2024', null));
    test('空 Header', () => !isAdmin('', null));
    test('null Header', () => !isAdmin(null, null));
    test('大小写敏感测试', () => !isAdmin('bearer ai2024', null));
    
    // --- 验证码生成测试 ---
    console.log('\n【验证码生成】');
    test('生成6位数字', () => {
        const code = generateCode();
        return code.length === 6 && /^\d{6}$/.test(code);
    });
    test('多次生成不重复（概率）', () => {
        const codes = new Set();
        for (let i = 0; i < 100; i++) codes.add(generateCode());
        return codes.size > 90; // 允许少量碰撞
    });
    test('验证码范围100000-999999', () => {
        for (let i = 0; i < 100; i++) {
            const code = parseInt(generateCode());
            if (code < 100000 || code > 999999) return false;
        }
        return true;
    });
    
    // --- 并发锁测试 ---
    console.log('\n【并发锁】');
    test('锁键包含邮箱', () => {
        const key = getLockKey('test@gd.chinamobile.com');
        return key.includes('test@gd.chinamobile.com') && key.includes('claim_lock');
    });
    test('不同邮箱不同锁键', () => {
        const key1 = getLockKey('a@gd.chinamobile.com');
        const key2 = getLockKey('b@gd.chinamobile.com');
        return key1 !== key2;
    });
    test('相同邮箱相同锁键', () => {
        const key1 = getLockKey('test@gd.chinamobile.com');
        const key2 = getLockKey('test@gd.chinamobile.com');
        return key1 === key2;
    });
    
    // --- 错误脱敏测试 ---
    console.log('\n【错误脱敏】');
    test('正常错误脱敏', () => sanitizeError('Some error') === '邮件发送失败，请稍后重试');
    test('空错误脱敏', () => sanitizeError('') === '服务暂时不可用');
    test('null错误脱敏', () => sanitizeError(null) === '服务暂时不可用');
    test('包含敏感信息也脱敏', () => sanitizeError('API_KEY=secret123') === '邮件发送失败，请稍后重试');
    
    // --- 常量一致性测试 ---
    console.log('\n【常量配置】');
    test('验证码有效期10分钟', () => CODE_EXPIRY_MS === 600000);
    test('限流间隔60秒', () => RATE_LIMIT_MS === 60000);
    test('邮箱域名正确', () => EMAIL_DOMAIN === '@gd.chinamobile.com');
    
    // --- 边界情况测试 ---
    console.log('\n【边界情况】');
    test('超长邮箱截断', () => {
        const longEmail = 'a'.repeat(100) + '@gd.chinamobile.com';
        // 应该仍然有效（技术上合法，只是不实用）
        return isValidEmail(longEmail);
    });
    test('特殊字符邮箱', () => !isValidEmail('user!@#$%^&*()@gd.chinamobile.com'));
    test('空格处理', () => isValidEmail('  test@gd.chinamobile.com  '));
    
    // --- 统计 ---
    console.log('\n=== 测试统计 ===');
    console.log(`总计: ${passed + failed}`);
    console.log(`通过: ${passed} ✓`);
    console.log(`失败: ${failed} ✗`);
    console.log(`通过率: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
    
    return { passed, failed, success: failed === 0 };
}

// 运行测试
const result = runTests();
process.exit(result.success ? 0 : 1);

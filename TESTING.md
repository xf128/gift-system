# Gift System 本地测试指南

## 当前测试状态 ✅

### 单元测试
```bash
node test.js
```
**结果**: 36/36 通过 (100%)

测试覆盖：
- 邮箱验证（13项）
- Admin 鉴权（7项）
- 验证码生成（3项）
- 并发锁（3项）
- 错误脱敏（4项）
- 常量配置（3项）
- 边界情况（3项）

### 启动本地服务器

**方式1 - Docker (推荐)**:
```bash
docker-compose -f docker-compose.local.yml up
# 访问 http://localhost:3002
```

**方式2 - 直接运行 (需编译完成)**:
```bash
npm install
npm rebuild better-sqlite3  # 需要编译 native 模块
sqlite3 db.sqlite < schema.sql
ADMIN_TOKEN=your-token node server.mjs
# 访问 http://localhost:3000
```

**方式3 - Wrangler (Cloudflare 模拟)**:
```bash
npx wrangler pages dev public --compatibility-date=2024-03-01 --binding DB=ai_claims_db
```

## API 测试用例

### 1. 状态查询
```bash
curl http://localhost:3000/api/gift/status
```

### 2. 发送验证码
```bash
curl -X POST http://localhost:3000/api/gift/send-code \
  -H "Content-Type: application/json" \
  -d '{"email": "test@gd.chinamobile.com"}'
```

### 3. 领取券码
```bash
curl -X POST http://localhost:3000/api/gift/claim \
  -H "Content-Type: application/json" \
  -d '{"email": "test@gd.chinamobile.com", "code": "123456"}'
```

### 4. 管理后台 - 查看数据
```bash
curl http://localhost:3000/api/gift/admin/data \
  -H "Authorization: Bearer ai2024"
```

### 5. 管理后台 - 添加券码
```bash
curl -X POST http://localhost:3000/api/gift/admin/add \
  -H "Authorization: Bearer ai2024" \
  -H "Content-Type: application/json" \
  -d '{"name": "测试券", "code": "TEST123"}'
```

### 6. 管理后台 - 切换开关
```bash
curl -X POST http://localhost:3000/api/gift/admin/config \
  -H "Authorization: Bearer ai2024" \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'
```

## 环境变量配置

创建 `.env` 文件：
```
ADMIN_TOKEN=ai2024
JSONBIN_API_KEY=your_key
EMAILJS_SERVICE_ID=your_service
EMAILJS_TEMPLATE_ID=your_template
EMAILJS_PUBLIC_KEY=your_public_key
EMAILJS_PRIVATE_KEY=your_private_key
```

## 前端访问

- 用户页面: http://localhost:3000/
- 管理后台: http://localhost:3000/?admin=ai2024

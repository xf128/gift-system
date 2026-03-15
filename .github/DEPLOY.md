# GitHub Actions 自动部署配置

## 概述

Push 代码到 `main` 分支时，自动部署到云主机 (175.27.226.170)。

## 配置步骤

### 1. 添加 SSH 公钥到云主机

在云主机上执行：
```bash
# 添加 GitHub Actions 部署公钥
echo "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDHVs34aP1oqL24YbQs1cROwv7CjIoG6gNRD2UH5vScx github-actions" >> ~/.ssh/authorized_keys
```

### 2. 在 GitHub 仓库设置 Secrets

进入仓库 Settings → Secrets and variables → Actions → New repository secret

添加以下 Secrets：

| Secret 名称 | 值 | 说明 |
|------------|-----|------|
| `SSH_PRIVATE_KEY` | SSH 私钥内容 | 对应 authorized_keys 中的公钥 |
| `HOST` | `175.27.226.170` | 云主机 IP |
| `USER` | `ubuntu` | 登录用户名 |

### 3. 生成 SSH 密钥对（如需要）

如果还没有专用密钥对：
```bash
ssh-keygen -t ed25519 -f github_actions_deploy -C "github-actions"
```

- **公钥** (`github_actions_deploy.pub`) → 添加到云主机 `~/.ssh/authorized_keys`
- **私钥** (`github_actions_deploy`) → 复制全部内容到 GitHub Secret `SSH_PRIVATE_KEY`

### 4. 测试部署

```bash
# 本地推送测试
git add .
git commit -m "Test auto deployment"
git push origin main
```

在 GitHub 仓库 Actions 标签页查看部署状态。

## 部署流程

```
Push to main
    ↓
GitHub Actions 触发
    ↓
SSH 连接到云主机
    ↓
rsync 同步文件 (排除 node_modules, .git 等)
    ↓
远程执行 docker compose build & up -d
    ↓
部署完成
```

## 手动触发

在 GitHub 仓库页面：
1. 进入 Actions 标签
2. 选择 "Deploy to Cloud"
3. 点击 "Run workflow"

## 安全说明

- SSH 私钥仅存储在 GitHub Secrets 中，不会暴露
- 云主机已配置仅允许密钥登录（禁用密码）
- rsync 排除所有敏感文件（.env, *.sqlite 等）
- 部署使用 sudo 需要配置免密 sudo 或 docker 组权限

## 故障排查

**SSH 连接失败**：
- 检查 `SSH_PRIVATE_KEY` 格式（需包含 BEGIN/END 行）
- 检查云主机 `~/.ssh/authorized_keys` 权限（应为 600）

**部署后服务未启动**：
- 检查云主机 Docker 状态：`sudo docker compose ps`
- 查看容器日志：`sudo docker compose logs gift`

**权限问题**：
- 确保 ubuntu 用户属于 docker 组：`sudo usermod -aG docker ubuntu`

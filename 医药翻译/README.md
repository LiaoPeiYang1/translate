# 医药翻译

医药翻译是一个面向企业内部的前后端分离项目骨架，围绕医药文本与文件翻译场景搭建。当前版本包含：

- 前端 React + Vite 界面骨架
- 后端 FastAPI API 骨架
- 已对齐的产品规则和默认交互

## 当前范围

- 登录：邮箱 + 密码为默认主入口，飞书 SSO 作为可选入口
- 文本翻译：支持多语种、自动检测、结果展示、失败重试、历史复用
- 文件翻译：单文件、最大 100MB、仅支持 `.docx` 和文本型 `.pdf`，译文保持原文件格式
- 结果展示：默认展示原文 / 译文预览，输出文件保持原版式并将全部文字翻译为目标语言
- 历史记录：统一保留 30 天，支持删除、筛选、分页

## 项目结构

```text
医药翻译/
├── README.md
├── .gitignore
├── package.json
├── docker-compose.yml
├── frontend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── styles.css
│       └── vite-env.d.ts
└── backend/
    ├── requirements.txt
    ├── .env.example
    └── app/
        └── main.py
```

## 快速启动

### 前端

```bash
cd frontend
npm install
npm run dev
```

### 后端

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 飞书 SSO 配置

1. 复制 `backend/.env.example` 为 `backend/.env`
2. 填写 `FEISHU_APP_ID` 与 `FEISHU_APP_SECRET`
3. 在飞书开放平台应用中把回调地址配置为 `FEISHU_REDIRECT_URI`
4. 本地默认回调为 `http://127.0.0.1:8000/api/auth/feishu/callback`

### 根目录便捷脚本

```bash
npm run frontend:dev
npm run frontend:build
npm run backend:dev
npm run backend:check
npm run ci:check
```

## CI/CD

- `CI`：位于 `.github/workflows/ci.yml`
- 触发方式：提交到 `main`、`codex/**`、`feature/**`、`fix/**` 分支，或发起 Pull Request
- 执行内容：前端 `npm ci && npm run build`，后端依赖安装、`py_compile` 校验，以及 `/health` 启动探活

- `CD`：位于 `.github/workflows/cd.yml`
- 触发方式：推送到 `main`，或在 GitHub Actions 页面手动 `Run workflow`
- 交付内容：自动构建并发布两个 Docker 镜像到 GitHub Container Registry
  - `ghcr.io/<你的 GitHub 用户名>/translate-backend`
  - `ghcr.io/<你的 GitHub 用户名>/translate-frontend`
- 部署方式：当仓库中配置了服务器 Secrets 后，`main` 分支或手动触发都会自动 SSH 到目标服务器并执行 `docker compose` 滚动更新
- 首次部署说明：对阿里云 Linux 3 服务器，工作流会自动使用阿里云镜像源安装 Docker 与 Compose 插件

### GitHub 仓库设置

1. 打开仓库 `Settings > Actions > General`
2. 确认 `Workflow permissions` 允许工作流读写 packages
3. 如需让前端镜像内置生产 API 地址，在仓库 `Settings > Secrets and variables > Actions` 中添加变量 `VITE_API_BASE_URL`
4. 如果不配置 `VITE_API_BASE_URL`，前端 Docker 镜像会默认使用 `/api`

### GitHub Actions Secrets

在仓库 `Settings > Secrets and variables > Actions` 中添加这些 Secrets：

- `DEPLOY_HOST`
- `DEPLOY_USER`
- `DEPLOY_PASSWORD`
- `PROD_JWT_SECRET`
- `PROD_FEISHU_APP_ID`
- `PROD_FEISHU_APP_SECRET`
- `PROD_FEISHU_REDIRECT_URI`

其中飞书相关可先留空，但如果生产环境要启用飞书登录，建议一并配置。

### GitHub Actions Variables

在同一页面添加这些 Variables：

- `DEPLOY_APP_DIR`
  - 默认建议：`/opt/medical-translate`
- `APP_PORT`
  - 默认建议：`80`
- `FRONTEND_BASE_URL`
  - 例如：`http://101.133.135.222`
- `PROD_FEISHU_SCOPE`
  - 默认：`contact:user.base:readonly contact:user.email:readonly`
- `VITE_API_BASE_URL`
  - 默认建议：`/api`

### 生产访问地址

- 页面入口：`http://101.133.135.222`
- 健康检查：`http://101.133.135.222/health`

### 容器构建文件

- 后端镜像：`backend/Dockerfile`
- 前端镜像：`frontend/Dockerfile`
- 前端静态服务配置：`frontend/nginx.conf`

## 说明

- 当前前端以可运行的产品界面骨架为主，便于继续迭代页面和状态管理。
- 当前后端以内存数据和占位接口为主，便于后续替换为真实鉴权、对象存储、任务队列和术语库。
- 这个项目不会改动当前仓库已有的其他业务工程。

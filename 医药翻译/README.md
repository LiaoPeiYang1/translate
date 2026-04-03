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
```

## 说明

- 当前前端以可运行的产品界面骨架为主，便于继续迭代页面和状态管理。
- 当前后端以内存数据和占位接口为主，便于后续替换为真实鉴权、对象存储、任务队列和术语库。
- 这个项目不会改动当前仓库已有的其他业务工程。

# 企业智能情报与话术生成系统

正式运营版企业名单采集、企业画像、外呼跟进和 AI 话术生成系统。

## 线上地址

- 前端：https://zxb.aiyes.vip/
- API：https://zxbapi.aiyes.vip/
- 健康检查：https://zxbapi.aiyes.vip/health

## 默认管理员

- 账号：`admin`
- 密码：`admin2026`

首次上线后建议尽快在服务器环境变量中改成强密码，并重启服务。

## 技术栈

- Frontend: React 19 + TypeScript + Vite + Tailwind CSS
- Backend: Node.js + Express
- Database: PostgreSQL
- Queue: Redis + BullMQ
- Deploy: Nginx + systemd + Git pull

## 本地开发

```bash
npm ci
npm run dev
```

后端开发需要准备 `.env`，可参考 `.env.example`。

```bash
npm run db:migrate
npm run db:seed
npm run server
npm run worker
```

## 生产部署

代码仓库：

```bash
git@github.com:lengyan11001/zxb.git
```

服务器目录：

```bash
/opt/enterprise-intel-prod
```

以后发布流程：

```bash
git push origin main
ssh root@39.107.255.159
cd /opt/enterprise-intel-prod
bash ops/deploy.sh
```

部署脚本会执行：

```bash
git pull --ff-only origin main
npm ci
npm run build
systemctl restart zxb-intel.service zxb-intel-worker.service
systemctl reload nginx
curl -fsS https://zxbapi.aiyes.vip/health
```

## 服务管理

```bash
systemctl status zxb-intel.service
systemctl status zxb-intel-worker.service
journalctl -u zxb-intel.service -f
journalctl -u zxb-intel-worker.service -f
```

## 重要约定

- `.env` 不进 Git，生产密钥只放服务器。
- 前端域名是 `zxb.aiyes.vip`。
- API 域名是 `zxbapi.aiyes.vip`。
- 旧路径 `https://zxb.aiyes.vip/zxbaip` 暂时保留兼容，新的调用统一走 API 子域名。

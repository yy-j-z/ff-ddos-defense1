FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
# -H 0.0.0.0: standalone server 默认用容器 HOSTNAME 环境变量解析监听地址,
# 多网络(app-net+attack-net)下可能解析到非映射网段 IP,导致宿主机访问被 reset
CMD ["node", "server.js", "-H", "0.0.0.0"]

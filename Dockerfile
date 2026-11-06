# syntax=docker/dockerfile:1
FROM node:24-slim AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# 빌드 단계는 DB·비밀값이 필요 없다(DB 연결은 지연 생성).
RUN pnpm build

FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN groupadd --system app && useradd --system --gid app --home /app app \
    && mkdir -p /data/bandi && chown -R app:app /data/bandi
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
# 마이그레이션 전용 최소 의존성(standalone 산출물에는 마이그레이터가 포함되지 않는다)
RUN mkdir -p /opt/migrate && cd /opt/migrate \
    && npm init -y >/dev/null \
    && npm install --omit=dev --no-audit --no-fund drizzle-orm@0.45.4 pg@8.23.1 \
    && chown -R app:app /opt/migrate
COPY --from=build --chown=app:app /app/drizzle /opt/migrate/drizzle
COPY --from=build --chown=app:app /app/scripts/migrate-prod.mjs /opt/migrate/migrate.mjs
USER app
VOLUME ["/data/bandi"]
EXPOSE 3000
# 마이그레이션 후 서버 기동
CMD ["sh", "-c", "cd /opt/migrate && node migrate.mjs && cd /app && node server.js"]

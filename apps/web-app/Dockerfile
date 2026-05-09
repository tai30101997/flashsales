FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .
RUN npx nx build web-app --prod

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT 3000

COPY --from=builder /app/dist/apps/web-app/.next/standalone ./
COPY --from=builder /app/dist/apps/web-app/.next/static ./dist/apps/web-app/.next/static
COPY --from=builder /app/dist/apps/web-app/public ./dist/apps/web-app/public

EXPOSE 3000

CMD ["node", "apps/web-app/server.js"]
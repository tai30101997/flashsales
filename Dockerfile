# stage stage1 : build the application
FROM node:20-slim AS builder

RUN  apt-get update && apt-get install -y \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm install -- legacy-peer-deps
# COPY all source files
COPY . . 

ARG ${APP_NAME}
RUN npx nx build ${APP_NAME} --prod
# stage stage2 : run the application
FROM node:20-slim 
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3333
ARG ${APP_NAME}
# copy only the build output and production dependencies
COPY --from=builder /app/dist/apps/${APP_NAME} ./
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3333

CMD ["node", "main.js"]
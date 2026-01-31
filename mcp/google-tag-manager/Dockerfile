FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

# Create directory for token storage
RUN mkdir -p /data && chmod 755 /data

ENV TOKEN_STORAGE_PATH=/data/tokens.json

EXPOSE 3001

CMD ["node", "dist/server.js"]

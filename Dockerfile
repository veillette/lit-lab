# ---- Stage 1: Build Eleventy site ----
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY eleventy.config.js ./
COPY src/ ./src/
COPY public/ ./public/
RUN npm run build

# ---- Stage 2: Production image ----
FROM node:20-alpine
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# Copy only what the server needs at runtime
COPY server.js ./
COPY server/ ./server/
COPY --from=builder /app/_site ./_site

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]

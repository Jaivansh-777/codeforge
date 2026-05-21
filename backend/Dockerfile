FROM node:20-bookworm-slim AS builder

WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm install
COPY src/ ./src/
RUN npm run build

FROM node:20-bookworm-slim AS runner

RUN apt-get update && apt-get install -y \
    python3 \
    gcc \
    g++ \
    php-cli \
    default-jdk \
    nasm \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3 /usr/bin/python

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./

RUN addgroup --system --gid 1001 codeforge && \
    adduser --system --uid 1001 codeforge && \
    chown -R codeforge:codeforge /app

USER codeforge

EXPOSE 4000

CMD ["node", "dist/index.js"]

FROM node:26-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

ENTRYPOINT ["npx", "tsx", "src/main.ts"]

FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=5s \
  CMD wget -qO- http://localhost:3100/health || exit 1
CMD ["npx", "tsx", "src/index.ts"]

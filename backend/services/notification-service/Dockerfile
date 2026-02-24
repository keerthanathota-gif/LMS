FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN NODE_OPTIONS=--max_old_space_size=512 npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
EXPOSE 3007
HEALTHCHECK --interval=30s --timeout=5s \
  CMD wget -qO- http://localhost:3007/health || exit 1
CMD ["node", "dist/index.js"]

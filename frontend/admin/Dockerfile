FROM node:20-alpine AS builder
WORKDIR /app
# Copy admin app
COPY admin/package*.json ./
RUN npm ci
COPY admin/ .
# Copy shared preset into expected relative location (tailwind.config.ts imports from ../shared/)
COPY shared/ ../shared/
RUN npm run build

FROM nginx:alpine AS runner
COPY --from=builder /app/dist /usr/share/nginx/html
COPY --from=builder /app/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s \
  CMD wget -qO- http://localhost:5000 || exit 1
CMD ["nginx", "-g", "daemon off;"]

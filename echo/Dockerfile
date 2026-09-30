# Stage 1: Development with Hot Reload
FROM node:22-alpine AS dev
WORKDIR /app/echo
COPY echo/package*.json ./
RUN npm ci
COPY echo/ .
COPY shared/ /app/shared/
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]

# Stage 2: Production builder
FROM dev AS builder
RUN npm run build

# Stage 3: Production Nginx
FROM nginx:alpine AS prod
RUN rm -rf /usr/share/nginx/html/* /etc/nginx/conf.d/default.conf
COPY echo/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/echo/dist /usr/share/nginx/html
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:80/ || exit 1
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

# syntax=docker/dockerfile:1.7
FROM node:22.13.1-alpine AS build

WORKDIR /app

ARG NEXT_PUBLIC_CONVEX_URL
ENV NEXT_PUBLIC_CONVEX_URL=$NEXT_PUBLIC_CONVEX_URL

COPY package.json package-lock.json ./
COPY admin/package.json admin/package-lock.json ./admin/
RUN npm ci && npm --prefix admin ci

COPY admin ./admin
COPY assets/icon.png ./admin/public/email-logo.png
COPY convex ./convex
COPY lib ./lib
COPY shared ./shared
RUN npm --prefix admin run build

FROM nginx:1.28-alpine AS runtime

COPY infra/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/admin/out /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/health || exit 1

CMD ["nginx", "-g", "daemon off;"]

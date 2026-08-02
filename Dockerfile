# syntax=docker/dockerfile:1.7
FROM node:22.13.1-alpine AS build

WORKDIR /app

ARG EXPO_PUBLIC_CONVEX_URL
ENV EXPO_PUBLIC_CONVEX_URL=$EXPO_PUBLIC_CONVEX_URL

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build:web

FROM nginx:1.28-alpine AS runtime

COPY infra/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/health || exit 1

CMD ["nginx", "-g", "daemon off;"]

FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json ./
COPY src ./src
RUN chown -R node:node /app
USER node
ENV NODE_ENV=production PORT=8094 OTA_DATA_DIR=/data
EXPOSE 8094
CMD ["node", "src/server.mjs"]

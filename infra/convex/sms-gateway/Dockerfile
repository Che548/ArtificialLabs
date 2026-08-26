FROM node:22.22.0-alpine3.23
WORKDIR /app
COPY --chown=node:node package.json server.mjs ./
RUN mkdir -p /data && chown node:node /data
USER node
ENV NODE_ENV=production PORT=8080 STATE_FILE=/data/idempotency.json
VOLUME ["/data"]
EXPOSE 8080
CMD ["node", "server.mjs"]

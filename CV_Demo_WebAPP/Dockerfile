FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends cmake g++ libopencv-dev ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY CV_Demo_WebAPP/package*.json ./CV_Demo_WebAPP/
RUN npm --prefix CV_Demo_WebAPP ci
COPY CV_Demo_WebAPP ./CV_Demo_WebAPP
COPY services/scanning ./services/scanning
COPY modules/strip-cv ./modules/strip-cv
COPY scripts/build-strip-cv.mjs ./scripts/build-strip-cv.mjs
COPY scripts/verify-strip-reader-package.mjs ./scripts/verify-strip-reader-package.mjs
RUN npm --prefix CV_Demo_WebAPP run build:cv
WORKDIR /app/CV_Demo_WebAPP
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run verify

FROM node:22-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends libopencv-core406 libopencv-imgproc406 libopencv-imgcodecs406 libopencv-calib3d406 libopencv-dnn406 ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app/CV_Demo_WebAPP
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 CV_DEMO_DATA_DIR=/data STRIPCV_CLI=/app/bin/stripcv_cli STRIPCV_MODELS=/app/models/reader-20260914
COPY --from=build /app/CV_Demo_WebAPP/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/CV_Demo_WebAPP/.next ./.next
COPY --from=build /app/CV_Demo_WebAPP/public ./public
COPY --from=build /app/web-build/stripcv-native/stripcv_cli /app/bin/stripcv_cli
COPY --from=build /app/modules/strip-cv/models/reader-20260914 /app/models/reader-20260914
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 3040
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:3040/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npm", "start"]

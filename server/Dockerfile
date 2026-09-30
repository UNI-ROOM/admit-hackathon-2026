FROM node:22-alpine
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY --chown=node:node server/src ./src
COPY --chown=node:node server/scripts ./scripts
COPY --chown=node:node shared /app/shared
USER node
EXPOSE 3000
CMD ["node", "--import", "tsx", "src/index.ts"]

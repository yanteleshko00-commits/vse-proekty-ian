FROM node:22-bookworm-slim
WORKDIR /app/nexora-text-studio
COPY nexora-text-studio/ ./
COPY nexora/text-engine.js nexora/package.json /app/nexora/
RUN npm ci && npm run check && npm test
ENV NODE_ENV=production PORT=10000
EXPOSE 10000
CMD ["node", "server.js"]

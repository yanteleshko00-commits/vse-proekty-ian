FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates fonts-dejavu-core libfontconfig1 && rm -rf /var/lib/apt/lists/*
WORKDIR /app/nexora-math-studio
COPY nexora-math-studio/ ./
RUN npm ci && npm run check && npm test
ENV NODE_ENV=production PORT=10000
EXPOSE 10000
CMD ["npm", "start"]

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app/nexora-image-studio
COPY nexora-image-studio/ ./
RUN npm ci && npm run check
ENV NODE_ENV=production PORT=10000
EXPOSE 10000
CMD ["npm", "start"]

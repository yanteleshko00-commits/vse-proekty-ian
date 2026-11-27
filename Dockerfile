FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv fonts-dejavu-core ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app/nexora
COPY nexora/ ./
RUN npm ci && npm run check && python3 -m venv .venv && .venv/bin/pip install --no-cache-dir reportlab && .venv/bin/python generate_pdfs.py
ENV NODE_ENV=production PORT=10000
EXPOSE 10000
CMD ["npm", "start"]

# Worker de produção (Railway): fila + FFmpeg. O painel roda na Vercel.
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ENV FFMPEG_PATH=ffmpeg STORAGE_DRIVER=nuvem
# Aplica o schema (idempotente), cria os dados de exemplo se o banco estiver vazio e inicia o worker.
CMD ["npm", "run", "worker:producao"]

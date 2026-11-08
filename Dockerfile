# Imagem única para painel e worker (Railway). O worker precisa do FFmpeg e de uma fonte para as legendas.
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-inter && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production FONTE_LEGENDA=/usr/share/fonts/opentype/inter/Inter-SemiBold.otf
# Painel: npm start   ·   Worker: npm run worker
CMD ["npm", "start"]

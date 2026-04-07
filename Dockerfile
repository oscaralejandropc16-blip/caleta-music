# ── Caleta Music – Lightweight YouTube API for Render ──
FROM node:20-slim

# Install yt-dlp, ffmpeg, python3
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    ffmpeg \
    curl \
    ca-certificates \
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Only install the minimal dependencies needed for the API server
COPY package.json ./
RUN npm install --omit=dev express cors yt-search

# Copy only the server file
COPY render-server.js ./

ENV PORT=3000
ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "render-server.js"]

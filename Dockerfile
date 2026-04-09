# ── Caleta Music – YouTube API for Render (v3) ──
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

RUN /usr/local/bin/yt-dlp -U || true

WORKDIR /app

# Install dependencies: youtubei.js is the primary extractor
RUN npm init -y && npm install express cors yt-search youtubei.js

# Copy server
COPY render-server.js ./

ENV PORT=3000
ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "render-server.js"]

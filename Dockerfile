FROM node:22-slim

# Install yt-dlp, ffmpeg, python3
RUN apt-get update && apt-get install -y \
    python3 \
    curl \
    ffmpeg \
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy server package files and install
COPY server/package*.json ./server/
RUN cd server && npm install

# Copy all server source files
COPY server/ ./server/

EXPOSE 3001

CMD ["sh", "-c", "cd server && npx tsx index.ts"]

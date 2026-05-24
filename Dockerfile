FROM node:20-slim

# Install Python, pip, ffmpeg, yt-dlp
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    && pip3 install yt-dlp --break-system-packages \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy server files
COPY server/package*.json ./server/
RUN cd server && npm install --production

# Copy all project files
COPY . .

WORKDIR /app/server

EXPOSE 3001

CMD ["node", "server.js"]

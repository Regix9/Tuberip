FROM node:20-slim
RUN apt-get update && apt-get install -y python3 python3-pip ffmpeg \
    && pip3 install yt-dlp --break-system-packages \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY server/package*.json ./server/
RUN cd server && npm install --production
COPY . .
WORKDIR /app/server
EXPOSE 3001
CMD ["node", "server.js"]

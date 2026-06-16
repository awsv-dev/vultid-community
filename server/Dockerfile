FROM node:20-slim

RUN apt-get update && apt-get install -y \
    python3 make g++ build-essential \
    libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

RUN npm install --omit=dev

COPY . .

EXPOSE 8105

CMD ["node", "app.js"]

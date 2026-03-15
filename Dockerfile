FROM node:20-slim

WORKDIR /app

# Install better-sqlite3 dependencies
RUN apt-get update && apt-get install -y python3 make g++ sqlite3 && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install

# Copy project files and adapter
COPY . .
COPY server.mjs .

EXPOSE 3000

CMD ["node", "server.mjs"]

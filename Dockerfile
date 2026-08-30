FROM node:20-alpine

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package*.json ./
RUN npm install --omit=dev

# Copy the rest of the app
COPY . .

# Make sure the uploads folder exists inside the image
RUN mkdir -p public/images

ENV NODE_ENV=production
EXPOSE 8000

CMD ["node", "server.js"]

FROM node:24.20.0-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN npm run check

ENV NODE_ENV=test

CMD ["npm", "test"]

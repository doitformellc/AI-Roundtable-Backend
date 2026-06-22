FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache openssl

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

COPY . .

EXPOSE 4000

CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]

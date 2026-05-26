FROM node:22-alpine AS base
WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json

RUN npm install

COPY . .

RUN npm run prisma:generate -w @syncbridge/api
RUN npm run build -w @syncbridge/api

EXPOSE 4100

CMD ["sh", "-c", "npx prisma db push --schema=apps/api/prisma/schema.prisma && node apps/api/dist/main.js"]

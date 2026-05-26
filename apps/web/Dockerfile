FROM node:22-alpine AS base
WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json

RUN npm install

COPY . .

RUN npm run build -w @syncbridge/web

EXPOSE 3001

CMD ["npm", "run", "start", "-w", "@syncbridge/web"]

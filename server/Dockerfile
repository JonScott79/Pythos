FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY server.js ./

EXPOSE 3006

ENV NODE_ENV=production
ENV PORT=3006
ENV OLLAMA_HOST=http://localhost:11434

CMD ["npm", "start"]

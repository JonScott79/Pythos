FROM node:22-alpine

# Install Python 3 and SymPy for Second-Line Deterministic CAS Verification
RUN apk add --no-cache python3 py3-sympy && \
    ln -sf /usr/bin/python3 /usr/bin/python

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . ./

# Prepare writable reports directory and enforce non-root user ownership (Phase 0.3)
RUN mkdir -p /app/reports && chown -R node:node /app

ENV NODE_ENV=production
ENV PORT=3006
ENV OLLAMA_HOST=http://localhost:11434

USER node

EXPOSE 3006

CMD ["npm", "start"]

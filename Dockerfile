# ── Etapa 1: build do site com Vite ──────────────────────────────
# Precisa das VITE_* (config do Firebase) em tempo de build. Elas vêm do
# .env, que é copiado junto (o Vite lê o .env automaticamente).
FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
# Só firebase + vite (dependencies); pula o netlify-cli (devDependency).
RUN npm ci --omit=dev
COPY . .
RUN npm run build

# ── Etapa 2: runtime enxuto ──────────────────────────────────────
# O servidor só usa APIs nativas do Node (http + fetch) e o handler do
# Steam — nenhuma dependência npm em runtime.
FROM node:20-slim AS run
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8888
COPY package.json ./
COPY server.js ./
COPY netlify ./netlify
COPY --from=build /app/dist ./dist
EXPOSE 8888
CMD ["node", "server.js"]

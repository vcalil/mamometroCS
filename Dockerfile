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
# F1 Fase 3: o handler /api/onboard usa firebase-admin (server-side SDK
# para gravar em roster/). Demais endpoints só usam fetch nativo.
FROM node:20-slim AS run
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8888
COPY package.json package-lock.json ./
# Copia node_modules com as deps de runtime (firebase-admin + transitive).
# O --omit=dev no build já excluiu netlify-cli; traz só o que importa.
COPY --from=build /app/node_modules ./node_modules
COPY server.js ./
COPY netlify ./netlify
COPY --from=build /app/dist ./dist
EXPOSE 8888
CMD ["node", "server.js"]

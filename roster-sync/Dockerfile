# Build context é a RAIZ do repo (ver docker-compose) pra a imagem incluir o
# pacote compartilhado mm_common/ além do pacote do serviço.
FROM python:3.12-slim

WORKDIR /app

# System deps: none required for firebase-admin (ships wheels).

COPY roster-sync/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY mm_common/ ./mm_common/
COPY roster-sync/roster_sync/ ./roster_sync/

# F2+ real watcher. Override in docker-compose if needed.
CMD ["python", "-m", "roster_sync"]

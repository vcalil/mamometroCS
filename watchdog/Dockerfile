# Build context é a RAIZ do repo (ver docker-compose) pra incluir o mm_common/.
FROM python:3.12-slim

WORKDIR /app

COPY mm_common/ ./mm_common/
COPY watchdog/main.py ./main.py

CMD ["python", "-u", "main.py"]

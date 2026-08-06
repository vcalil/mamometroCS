FROM python:3.12-slim

WORKDIR /app

# System deps: none required for firebase-admin (ships wheels).

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY roster_sync/ ./roster_sync/

# F2+ real watcher. Override in docker-compose if needed.
CMD ["python", "-m", "roster_sync"]

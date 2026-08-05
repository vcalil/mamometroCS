FROM python:3.12-slim

WORKDIR /app

# System deps: none required for demoparser2 (it ships wheels) or firebase-admin.
# Keep the image lean — if a future build needs g++ etc., add here.

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY demo_parser/ ./demo_parser/

# Default command: dry-run stub. Override per-service in docker-compose if needed.
# `watch` is a stub in F0 — real polling comes in a later milestone.
CMD ["python", "-m", "demo_parser", "watch"]

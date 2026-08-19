FROM python:3.11-slim

# --------------------------------------------------
# Environment
# --------------------------------------------------
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# --------------------------------------------------
# System Dependencies
# --------------------------------------------------
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        gcc \
        curl && \
    rm -rf /var/lib/apt/lists/*

# --------------------------------------------------
# Python Dependencies
# --------------------------------------------------
COPY requirements.txt .

# Skip private package during Docker build
RUN grep -v '^emergentintegrations' requirements.txt > requirements.docker.txt && \
    pip install --upgrade pip && \
    pip install -r requirements.docker.txt

# --------------------------------------------------
# Application
# --------------------------------------------------
COPY . .

# --------------------------------------------------
# Non-root user
# --------------------------------------------------
RUN addgroup --system app && \
    adduser --system --ingroup app app && \
    chown -R app:app /app

USER app

# --------------------------------------------------
# Network
# --------------------------------------------------
EXPOSE 8001

# --------------------------------------------------
# Health Check
# Requires: GET /api/health -> HTTP 200
# (docker-compose.yml defines its own healthcheck that overrides this one
# when run via `docker compose`; this stays correct for standalone `docker run`)
# --------------------------------------------------
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
CMD curl -f http://localhost:8001/api/health || exit 1

# --------------------------------------------------
# Start Server
# --------------------------------------------------
CMD ["gunicorn", \
     "-k", "uvicorn.workers.UvicornWorker", \
     "-w", "4", \
     "-b", "0.0.0.0:8001", \
     "server:app"]
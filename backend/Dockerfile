FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
# emergentintegrations is served from a private index not reachable in this build
# environment; skip it here while keeping it listed in requirements.txt for
# environments that do have access.
RUN grep -v '^emergentintegrations' requirements.txt > requirements.docker.txt \
    && pip install -r requirements.docker.txt

COPY . .

EXPOSE 8001

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8001"]

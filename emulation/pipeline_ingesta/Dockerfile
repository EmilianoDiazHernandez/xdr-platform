FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

RUN pip install --no-cache-dir requests

WORKDIR /app
COPY zeek_stream_adapter.py /app/

ENV ZEEK_LOG_PATH="/zeek_logs"
ENV API_URL="http://api-ml:8000/api/v1/analyze-network"
ENV BATCH_SIZE=20
ENV FLUSH_INTERVAL=1.0

CMD ["python3", "zeek_stream_adapter.py"]

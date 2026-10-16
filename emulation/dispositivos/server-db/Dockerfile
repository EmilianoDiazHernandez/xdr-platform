FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    iproute2 \
    iptables \
    iputils-ping \
    net-tools \
    tcpdump \
    curl \
    socat \
    procps \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

RUN pip install --no-cache-dir fastapi uvicorn

WORKDIR /app
COPY listener.py /app/

ENV DEVICE_HOSTNAME="SRV-DB-INTERNAL"
ENV DEVICE_IP="10.20.30.50"

EXPOSE 5432 445 8050

CMD ["python3", "listener.py"]

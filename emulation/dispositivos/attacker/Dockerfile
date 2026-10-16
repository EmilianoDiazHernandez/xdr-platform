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
    dnsutils \
    procps \
    nmap \
    hping3 \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

RUN pip install --no-cache-dir requests fastapi uvicorn scapy

WORKDIR /app
COPY attack_controller.py /app/

EXPOSE 5000

CMD ["uvicorn", "attack_controller:app", "--host", "0.0.0.0", "--port", "5000"]

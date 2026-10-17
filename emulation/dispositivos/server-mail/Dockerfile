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

RUN pip install --no-cache-dir requests fastapi uvicorn aiosmtpd

WORKDIR /app
COPY email_feature_extractor.py smtp_receiver.py /app/

ENV DEVICE_HOSTNAME="CORP-MAIL-EXCHANGE"
ENV DEVICE_IP="172.16.0.20"

EXPOSE 25 8025

CMD ["python3", "smtp_receiver.py"]

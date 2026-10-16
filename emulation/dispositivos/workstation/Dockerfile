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

RUN pip install --no-cache-dir requests fastapi uvicorn

WORKDIR /app
COPY user_simulator.py edr_agent.py /app/

ENV DEVICE_HOSTNAME="VENTAS-PC"
ENV DEVICE_IP="10.20.30.45"

EXPOSE 5001

CMD ["uvicorn", "edr_agent:app", "--host", "0.0.0.0", "--port", "5001"]

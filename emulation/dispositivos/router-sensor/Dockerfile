FROM zeek/zeek:latest

RUN apt-get update && apt-get install -y --no-install-recommends \
    iproute2 \
    iptables \
    iputils-ping \
    net-tools \
    tcpdump \
    procps \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY router_init.sh /app/
COPY zeek_configs/ /app/zeek_configs/

RUN chmod +x /app/router_init.sh

VOLUME ["/zeek_logs"]

ENTRYPOINT ["/app/router_init.sh"]

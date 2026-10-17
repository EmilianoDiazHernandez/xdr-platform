FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# El colector espera que el conn.log esté en un volumen montado
ENV ZEEK_LOG_PATH=/logs/conn.log
ENV API_URL=http://xdr-api-ml:8000/api/v1/analyze-network
ENV BATCH_SIZE=50

CMD ["python", "colector.py"]

FROM python:3.11-slim

# Dependencias para WeasyPrint (renderizado de PDF) y utilidades
RUN apt-get update && apt-get install -y \
    python3-pip \
    python3-cffi \
    python3-brotli \
    libpango-1.0-0 \
    libharfbuzz0b \
    libpangoft2-1.0-0 \
    libpangocairo-1.0-0 \
    libglib2.0-0 \
    libgdk-pixbuf2.0-0 \
    libffi-dev \
    shared-mime-info \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiamos solo el código fuente
COPY src/ /app/src/

# Directorio de salida para reportes
RUN mkdir -p /app/src/reports/output

ENV PYTHONPATH=/app/src

EXPOSE 8000
EXPOSE 8001

CMD ["uvicorn", "ml.fastAPI:app", "--host", "0.0.0.0", "--port", "8000"]

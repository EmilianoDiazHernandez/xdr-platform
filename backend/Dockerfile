FROM python:3.11-slim-bookworm

# Evitar prompts interactivos durante apt
ENV DEBIAN_FRONTEND=noninteractive

# Dependencias del sistema para WeasyPrint (renderizado PDF) y LightGBM (OpenMP)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpango-1.0-0 \
    libpangoft2-1.0-0 \
    libpangocairo-1.0-0 \
    libharfbuzz0b \
    libglib2.0-0 \
    libgdk-pixbuf-2.0-0 \
    libffi-dev \
    shared-mime-info \
    libjpeg62-turbo \
    libopenjp2-7 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiamos src y models_data
COPY src/ /app/src/
COPY models_data/ /app/models_data/

ENV PYTHONPATH=/app

EXPOSE 8000
EXPOSE 8001

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]

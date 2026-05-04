FROM python:3.10-slim

WORKDIR /app

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

# El código se montará como volumen
CMD ["uvicorn", "ML.fastAPI3:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

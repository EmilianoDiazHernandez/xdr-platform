FROM timescale/timescaledb:latest-pg15

# Los scripts SQL en /docker-entrypoint-initdb.d/ se ejecutan 
# automáticamente al crear un nuevo contenedor si el volumen está vacío.
COPY ./init-scripts /docker-entrypoint-initdb.d/

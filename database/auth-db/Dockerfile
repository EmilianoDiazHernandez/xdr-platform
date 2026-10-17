FROM postgres:15-alpine

# Copiamos el script de esquema y datos iniciales para que se ejecuten al iniciar el contenedor
COPY ./init-scripts/ /docker-entrypoint-initdb.d/

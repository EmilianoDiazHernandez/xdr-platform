FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

# Se expone el puerto para desarrollo de la web Dashboard
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3000"]

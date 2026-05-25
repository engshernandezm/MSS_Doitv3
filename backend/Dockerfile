FROM node:20-alpine

WORKDIR /app

# Instalar dependencias primero (capa separada para cache)
COPY package*.json ./
RUN npm install --production

# Copiar código fuente
COPY src/ ./src/

# Directorio de uploads
RUN mkdir -p uploads

# Script de arranque
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["/docker-entrypoint.sh"]

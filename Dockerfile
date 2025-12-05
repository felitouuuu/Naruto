FROM node:20-bullseye

# Instalar dependencias del sistema para canvas
RUN apt-get update && apt-get install -y \
  build-essential \
  libcairo2-dev \
  libpango1.0-dev \
  libjpeg-dev \
  libgif-dev \
  librsvg2-dev \
  python3 \
  pkg-config \
  && rm -rf /var/lib/apt/lists/*

# Crear carpeta de la app
WORKDIR /app

# Copiar package.json (y lock si lo tienes)
COPY package*.json ./

# Instalar dependencias
RUN npm install --omit=dev

# Copiar el resto del código
COPY . .

# Comando de arranque
CMD ["node", "index.js"]

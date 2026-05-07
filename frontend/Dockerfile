# frontend/Dockerfile

# ── Stage 1: Build ──────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# ── Stage 2: Serve with Nginx ────────────────
FROM nginx:alpine

# Copy built files to nginx
# If you use Vite the output is /dist — if Create React App it's /build
# Change "dist" to "build" below if you used Create React App
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

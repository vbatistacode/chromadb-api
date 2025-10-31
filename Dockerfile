# -----------------------------
# 1) Build Stage
# -----------------------------
    FROM node:20-alpine AS builder

    WORKDIR /app
    
    COPY package*.json ./
    
    RUN npm install
    
    COPY . .
    
    RUN npm run build
    
    # -----------------------------
    # 2) Production Runtime
    # -----------------------------
    FROM node:20-alpine AS runner
    
    WORKDIR /app
    
    # Copy built app + dependencies
    COPY --from=builder /app/node_modules ./node_modules
    COPY --from=builder /app/dist ./dist
    COPY package*.json ./
    
    ENV NODE_ENV=production
    ENV PORT=3000
    
    EXPOSE 3000
    
    CMD ["node", "dist/index.js"]
    
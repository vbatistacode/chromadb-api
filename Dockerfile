# -----------------------------
# 1) Build Stage
# -----------------------------
    FROM node:20-alpine AS builder

    # Create app directory
    WORKDIR /app
    
    # Install dependencies first (better caching)
    COPY package*.json ./
    
    # If using pnpm (recommended for Hono), uncomment:
    # RUN npm install -g pnpm
    # RUN pnpm install
    
    RUN npm install
    
    # Copy app code
    COPY . .
    
    # Build TypeScript (if applicable)
    RUN npm run build
    
    # -----------------------------
    # 2) Production Runtime
    # -----------------------------
    FROM node:20-alpine AS runner
    
    WORKDIR /app
    
    # Copy built app + only production deps
    COPY --from=builder /app/node_modules ./node_modules
    COPY --from=builder /app/dist ./dist
    COPY package*.json ./
    
    ENV NODE_ENV=production
    EXPOSE 3000
    
    # If your Hono app starts via Node
    CMD ["node", "dist/index.js"]
    
    # If using something like "npm start", replace with:
    # CMD ["npm", "start"]
    
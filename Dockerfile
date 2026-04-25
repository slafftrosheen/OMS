FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Copy local packages (required for dependencies)
COPY packages/ ./packages/

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Remove dev dependencies
RUN npm prune --production

# ─── Production stage ───
FROM node:20-alpine

WORKDIR /app

# Run as the unprivileged `node` user that comes baked into node:alpine.
# Owning /app first lets the user write the runtime caches they need.
RUN chown -R node:node /app
USER node

COPY --chown=node:node --from=builder /app/build ./build
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/package.json ./

EXPOSE 3000
ENV NODE_ENV=production

CMD ["node", "build"]

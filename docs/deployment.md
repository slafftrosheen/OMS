# Deployment Guide

Production deployment instructions for Reclame OMS.

## Deployment Options

| Option | Best For | Complexity |
|--------|----------|------------|
| Node.js Server | Full control, SSR | Medium |
| Docker | Containerized environments | Medium |
| Static Hosting | GitHub Pages, Netlify | Low |

## Node.js Server Deployment

### Prerequisites

- Node.js 18+ installed
- PostgreSQL 14+ running
- PM2 or similar process manager
- Nginx (recommended) as reverse proxy

### 1. Build Application

```bash
# Clone repository
git clone <repository-url>
cd reclame_OMS

# Install dependencies
npm ci --production=false

# Build for production
npm run build
```

### 2. Configure Environment

```bash
# Create production environment file
cat > .env << EOF
DB_HOST=localhost
DB_PORT=5432
DB_NAME=reclame_oms
DB_USER=reclame_admin
DB_PASSWORD=your_secure_production_password
NODE_ENV=production
EOF
```

### 3. Initialize Database

```bash
chmod +x scripts/init-database.sh
./scripts/init-database.sh
```

### 4. Start with PM2

```bash
# Install PM2 globally
npm install -g pm2

# Create PM2 ecosystem file
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'reclame-oms',
    script: 'build/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
};
EOF

# Start application
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
```

### 5. Configure Nginx

```nginx
# /etc/nginx/sites-available/reclame-oms
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Static assets caching
    location /_app {
        proxy_pass http://127.0.0.1:3000;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

```bash
# Enable site
ln -s /etc/nginx/sites-available/reclame-oms /etc/nginx/sites-enabled/

# Test configuration
nginx -t

# Reload Nginx
systemctl reload nginx
```

### 6. SSL Certificate (Let's Encrypt)

```bash
# Install Certbot
apt install certbot python3-certbot-nginx

# Obtain certificate
certbot --nginx -d your-domain.com

# Auto-renewal
certbot renew --dry-run
```

---

## Docker Deployment

### Dockerfile

```dockerfile
# Dockerfile
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:18-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/build ./build
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000

USER node

CMD ["node", "build/index.js"]
```

### docker-compose.yml

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DB_HOST=db
      - DB_PORT=5432
      - DB_NAME=reclame_oms
      - DB_USER=reclame_admin
      - DB_PASSWORD=${DB_PASSWORD}
      - NODE_ENV=production
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped

  db:
    image: postgres:14-alpine
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./src/lib/server/db/migrations:/docker-entrypoint-initdb.d/migrations
      - ./src/lib/server/db/seeds:/docker-entrypoint-initdb.d/seeds
    environment:
      - POSTGRES_DB=reclame_oms
      - POSTGRES_USER=reclame_admin
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U reclame_admin -d reclame_oms"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  postgres_data:
```

### Deploy with Docker Compose

```bash
# Create .env file
echo "DB_PASSWORD=your_secure_password" > .env

# Build and start
docker-compose up -d --build

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

---

## Static Hosting (Limited)

For static-only deployment (no SSR, no API):

### 1. Configure Static Adapter

```bash
npm install @sveltejs/adapter-static
```

```javascript
// svelte.config.js
import adapter from '@sveltejs/adapter-static';

export default {
  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: 'index.html'
    }),
    prerender: {
      entries: ['*']
    }
  }
};
```

### 2. External API

When using static hosting, API must be hosted separately:

```env
PUBLIC_API_BASE_URL=https://api.your-domain.com
```

### 3. Deploy to GitHub Pages

```yaml
# .github/workflows/deploy.yml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build
        run: npm run build
      
      - name: Deploy
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./build
```

---

## Database Setup

### PostgreSQL Installation

```bash
# Ubuntu/Debian
apt update
apt install postgresql postgresql-contrib

# Start service
systemctl start postgresql
systemctl enable postgresql
```

### Create Database and User

```bash
sudo -u postgres psql << EOF
CREATE USER reclame_admin WITH PASSWORD 'your_secure_password';
CREATE DATABASE reclame_oms OWNER reclame_admin;
GRANT ALL PRIVILEGES ON DATABASE reclame_oms TO reclame_admin;
\q
EOF
```

### Configure Remote Access (if needed)

```bash
# Edit postgresql.conf
listen_addresses = '*'

# Edit pg_hba.conf
host    reclame_oms    reclame_admin    10.0.0.0/8    scram-sha-256

# Restart PostgreSQL
systemctl restart postgresql
```

### Run Migrations

```bash
./scripts/init-database.sh
```

---

## Production Security Checklist

### Application

- [ ] Set `NODE_ENV=production`
- [ ] Use HTTPS only
- [ ] Enable `secure` flag on cookies
- [ ] Update default password hashes
- [ ] Remove development users
- [ ] Configure rate limiting
- [ ] Set up error monitoring

### Database

- [ ] Use strong passwords
- [ ] Restrict network access
- [ ] Enable SSL connections
- [ ] Regular backups
- [ ] Monitor connection usage

### Server

- [ ] Keep system updated
- [ ] Configure firewall (UFW/iptables)
- [ ] Set up fail2ban
- [ ] Enable automatic security updates
- [ ] Configure log rotation

### Monitoring

- [ ] Application health checks
- [ ] Database monitoring
- [ ] Disk space alerts
- [ ] SSL certificate expiry alerts
- [ ] Uptime monitoring

---

## Backup Strategy

### Database Backup

```bash
#!/bin/bash
# backup-db.sh

BACKUP_DIR=/var/backups/reclame-oms
DATE=$(date +%Y%m%d_%H%M%S)
FILENAME="${BACKUP_DIR}/reclame_oms_${DATE}.sql.gz"

mkdir -p $BACKUP_DIR

PGPASSWORD=$DB_PASSWORD pg_dump -h localhost -U reclame_admin reclame_oms | gzip > $FILENAME

# Keep only last 7 days
find $BACKUP_DIR -name "*.sql.gz" -mtime +7 -delete

echo "Backup completed: $FILENAME"
```

### Automated Backups (Cron)

```bash
# Daily backup at 2 AM
0 2 * * * /path/to/backup-db.sh >> /var/log/backup.log 2>&1
```

### Restore from Backup

```bash
gunzip < backup_file.sql.gz | psql -U reclame_admin -d reclame_oms
```

---

## Scaling Considerations

### Horizontal Scaling

```
                    ┌─────────────┐
                    │   Nginx     │
                    │   (LB)      │
                    └──────┬──────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
    ┌─────┴─────┐    ┌─────┴─────┐    ┌─────┴─────┐
    │   App 1   │    │   App 2   │    │   App 3   │
    │  (PM2)    │    │  (PM2)    │    │  (PM2)    │
    └─────┬─────┘    └─────┬─────┘    └─────┬─────┘
          │                │                │
          └────────────────┼────────────────┘
                           │
                    ┌──────┴──────┐
                    │  PostgreSQL │
                    │  (Primary)  │
                    └─────────────┘
```

### Considerations

- Use Redis for session storage across instances
- Configure PostgreSQL connection pooling (PgBouncer)
- Use shared storage for file uploads
- Implement WebSocket clustering for real-time features

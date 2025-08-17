#!/bin/bash

# Production Setup Script for Instagram Automation Pipeline
# Run this on your cloud server after cloning the repository

set -e  # Exit on error

echo "🚀 Starting Production Setup..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   echo -e "${RED}This script should not be run as root!${NC}"
   exit 1
fi

# 1. Update system
echo -e "\n${YELLOW}1. Updating system packages...${NC}"
sudo apt update && sudo apt upgrade -y

# 2. Install PostgreSQL
echo -e "\n${YELLOW}2. Installing PostgreSQL...${NC}"
sudo apt install -y postgresql postgresql-contrib

# 3. Install Node.js 20 LTS
echo -e "\n${YELLOW}3. Installing Node.js 20 LTS...${NC}"
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 4. Install Chrome dependencies for Puppeteer
echo -e "\n${YELLOW}4. Installing Chrome dependencies...${NC}"
sudo apt-get install -y \
    chromium-browser \
    libx11-xcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxi6 \
    libxtst6 \
    libnss3 \
    libcups2 \
    libxss1 \
    libxrandr2 \
    libasound2 \
    libpangocairo-1.0-0 \
    libatk1.0-0 \
    libcairo-gobject2 \
    libgtk-3-0 \
    libgbm-dev

# 5. Install PM2 globally
echo -e "\n${YELLOW}5. Installing PM2...${NC}"
sudo npm install -g pm2

# 6. Create directories
echo -e "\n${YELLOW}6. Creating directories...${NC}"
mkdir -p logs output/qualified output/dm-ready output/handoff sessions data backups pids

# 7. Set up PostgreSQL database
echo -e "\n${YELLOW}7. Setting up PostgreSQL database...${NC}"
echo "Please enter PostgreSQL password for 'ig_user':"
read -s DB_PASSWORD

sudo -u postgres psql <<EOF
CREATE DATABASE instagram_automation;
CREATE USER ig_user WITH ENCRYPTED PASSWORD '$DB_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE instagram_automation TO ig_user;
EOF

# 8. Create .env file
echo -e "\n${YELLOW}8. Creating .env file...${NC}"
if [ ! -f .env ]; then
    cp .env.production .env
    echo -e "${GREEN}Created .env from .env.production${NC}"
    echo -e "${YELLOW}Please edit .env and add your API keys!${NC}"
else
    echo -e "${YELLOW}.env already exists${NC}"
fi

# 9. Update DATABASE_URL in .env
echo -e "\n${YELLOW}9. Updating DATABASE_URL...${NC}"
sed -i "s|postgresql://ig_user:your_secure_password@localhost|postgresql://ig_user:$DB_PASSWORD@localhost|g" .env

# 10. Install npm dependencies
echo -e "\n${YELLOW}10. Installing npm dependencies...${NC}"
npm install

# 11. Initialize database tables
echo -e "\n${YELLOW}11. Initializing database tables...${NC}"
npm run enhanced:db-init

# 12. Set up PM2 startup
echo -e "\n${YELLOW}12. Setting up PM2 startup...${NC}"
pm2 startup systemd -u $USER --hp $HOME
# Follow the command output to enable startup

# 13. Create log rotation config
echo -e "\n${YELLOW}13. Setting up log rotation...${NC}"
sudo tee /etc/logrotate.d/ig-automation > /dev/null <<EOF
$PWD/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 0644 $USER $USER
}
EOF

# 14. Create systemd service (alternative to PM2)
echo -e "\n${YELLOW}14. Creating systemd service...${NC}"
sudo tee /etc/systemd/system/ig-pipeline.service > /dev/null <<EOF
[Unit]
Description=Instagram Automation Pipeline
After=network.target postgresql.service

[Service]
Type=simple
User=$USER
WorkingDirectory=$PWD
ExecStart=/usr/bin/node src/cli-continuous.mjs
Restart=always
RestartSec=10
StandardOutput=append:$PWD/logs/systemd.log
StandardError=append:$PWD/logs/systemd-error.log
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

# 15. Create backup script
echo -e "\n${YELLOW}15. Creating backup script...${NC}"
cat > scripts/backup.sh << 'EOF'
#!/bin/bash
# Daily backup script

BACKUP_DIR="/home/$USER/ig-automation/backups"
DATE=$(date +%Y%m%d_%H%M%S)

# Backup database
pg_dump -U ig_user instagram_automation > "$BACKUP_DIR/db_backup_$DATE.sql"

# Backup sessions
tar -czf "$BACKUP_DIR/sessions_backup_$DATE.tar.gz" sessions/

# Backup config
tar -czf "$BACKUP_DIR/config_backup_$DATE.tar.gz" config/

# Keep only last 7 days of backups
find "$BACKUP_DIR" -type f -mtime +7 -delete

echo "Backup completed: $DATE"
EOF
chmod +x scripts/backup.sh

# 16. Add cron jobs
echo -e "\n${YELLOW}16. Setting up cron jobs...${NC}"
(crontab -l 2>/dev/null; echo "0 2 * * * $PWD/scripts/backup.sh") | crontab -
(crontab -l 2>/dev/null; echo "0 */4 * * * cd $PWD && npm run session:health >> logs/session-health.log 2>&1") | crontab -

# 17. Final instructions
echo -e "\n${GREEN}✅ Production setup complete!${NC}"
echo -e "\n${YELLOW}Next steps:${NC}"
echo "1. Edit .env file and add your API keys:"
echo "   - OPENAI_API_KEY"
echo "   - ANTHROPIC_API_KEY"
echo "   - APIFY_TOKEN"
echo "   - SESSION_ENCRYPTION_KEY (32-byte hex)"
echo ""
echo "2. Configure your Instagram accounts in:"
echo "   config/account_proxy_config.json"
echo ""
echo "3. Configure your proxies in:"
echo "   config/proxies.json"
echo ""
echo "4. Initialize Instagram sessions:"
echo "   npm run session:init"
echo ""
echo "5. Start the pipeline with PM2:"
echo "   pm2 start ecosystem.config.js"
echo "   pm2 save"
echo ""
echo "6. Or use systemd:"
echo "   sudo systemctl enable ig-pipeline"
echo "   sudo systemctl start ig-pipeline"
echo ""
echo "7. Check health endpoint:"
echo "   curl http://localhost:3000/health"
echo ""
echo -e "${GREEN}🎉 Setup complete! Happy automating!${NC}"
#!/bin/bash
# Automated backup script for PostgreSQL

# Configuration
BACKUP_DIR="/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DB_HOST="${POSTGRES_HOST:-postgres}"
DB_NAME="${POSTGRES_DB:-ofm_production}"
DB_USER="${POSTGRES_USER:-ofm}"
RETENTION_DAYS=7

# Create backup directory if it doesn't exist
mkdir -p "${BACKUP_DIR}/daily"
mkdir -p "${BACKUP_DIR}/weekly"
mkdir -p "${BACKUP_DIR}/monthly"

# Function to perform backup
perform_backup() {
    local backup_type=$1
    local backup_file="${BACKUP_DIR}/${backup_type}/backup_${DB_NAME}_${TIMESTAMP}.sql.gz"
    
    echo "[$(date)] Starting ${backup_type} backup..."
    
    # Perform the backup
    pg_dump -h "${DB_HOST}" -U "${DB_USER}" -d "${DB_NAME}" \
        --no-owner --no-privileges --clean --if-exists \
        | gzip > "${backup_file}"
    
    if [ $? -eq 0 ]; then
        echo "[$(date)] ${backup_type} backup completed successfully: ${backup_file}"
        
        # Calculate checksum
        sha256sum "${backup_file}" > "${backup_file}.sha256"
        
        # Test the backup
        if gunzip -t "${backup_file}" 2>/dev/null; then
            echo "[$(date)] Backup integrity check passed"
        else
            echo "[$(date)] ERROR: Backup integrity check failed!"
            exit 1
        fi
    else
        echo "[$(date)] ERROR: ${backup_type} backup failed!"
        exit 1
    fi
}

# Perform daily backup
perform_backup "daily"

# If it's Sunday, also create a weekly backup
if [ $(date +%u) -eq 7 ]; then
    perform_backup "weekly"
fi

# If it's the first day of the month, create a monthly backup
if [ $(date +%d) -eq 01 ]; then
    perform_backup "monthly"
fi

# Clean up old backups
echo "[$(date)] Cleaning up old backups..."

# Keep daily backups for 7 days
find "${BACKUP_DIR}/daily" -name "*.sql.gz" -mtime +${RETENTION_DAYS} -delete
find "${BACKUP_DIR}/daily" -name "*.sha256" -mtime +${RETENTION_DAYS} -delete

# Keep weekly backups for 30 days
find "${BACKUP_DIR}/weekly" -name "*.sql.gz" -mtime +30 -delete
find "${BACKUP_DIR}/weekly" -name "*.sha256" -mtime +30 -delete

# Keep monthly backups for 365 days
find "${BACKUP_DIR}/monthly" -name "*.sql.gz" -mtime +365 -delete
find "${BACKUP_DIR}/monthly" -name "*.sha256" -mtime +365 -delete

echo "[$(date)] Backup process completed"
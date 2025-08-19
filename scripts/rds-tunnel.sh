#!/bin/bash

# Script pour créer un tunnel SSH vers RDS via une instance EC2

# Configuration
EC2_HOST="votre-ec2-public.compute.amazonaws.com"  # Remplacez par votre instance EC2
EC2_USER="ec2-user"  # ou ubuntu selon votre AMI
RDS_HOST="huntaze.c2ryoow8c5m4.us-east-1.rds.amazonaws.com"
RDS_PORT="5432"
LOCAL_PORT="5432"

echo "🔒 Création d'un tunnel SSH vers RDS..."
echo "Local: localhost:$LOCAL_PORT → EC2 → RDS: $RDS_HOST:$RDS_PORT"

# Créer le tunnel
ssh -N -L $LOCAL_PORT:$RDS_HOST:$RDS_PORT $EC2_USER@$EC2_HOST

# Le script restera actif tant que le tunnel est ouvert
# Utilisez Ctrl+C pour fermer le tunnel
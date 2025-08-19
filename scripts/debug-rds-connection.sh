#!/bin/bash

echo "🔍 Diagnostic de connexion RDS"
echo "=============================="

RDS_HOST="huntaze.c2ryoow8c5m4.us-east-1.rds.amazonaws.com"

# 1. Résolution DNS
echo -e "\n1. Résolution DNS:"
nslookup $RDS_HOST 2>/dev/null || host $RDS_HOST 2>/dev/null || echo "❌ Impossible de résoudre le nom DNS"

# 2. Ping (ne marchera pas mais montre si l'hôte existe)
echo -e "\n2. Test ping (ignorez les timeouts, c'est normal):"
ping -c 2 $RDS_HOST 2>&1 | head -5

# 3. Test de port avec timeout court
echo -e "\n3. Test du port 5432:"
timeout 5 nc -zv $RDS_HOST 5432 2>&1 || echo "❌ Port 5432 non accessible"

# 4. Test avec telnet
echo -e "\n4. Test avec telnet:"
(echo > /dev/tcp/$RDS_HOST/5432) &>/dev/null && echo "✅ Port 5432 ouvert" || echo "❌ Port 5432 fermé"

# 5. Traceroute pour voir où ça bloque
echo -e "\n5. Traceroute (premiers sauts):"
traceroute -m 10 -w 2 $RDS_HOST 2>&1 | head -15

echo -e "\n=============================="
echo "📌 Résumé:"
echo "- Si la résolution DNS fonctionne → RDS existe"
echo "- Si le port 5432 est fermé → Problème de Security Group ou Publicly accessible"
echo "- Si traceroute s'arrête → Problème réseau/firewall"
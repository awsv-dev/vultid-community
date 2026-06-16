#!/bin/bash
# VULT ID - Script de Configuración Inicial
# Ejecutar después de levantar docker-compose up -d

set -e

API_URL="${API_URL:-http://localhost:8105}"
DASHBOARD_URL="${DASHBOARD_URL:-http://localhost:8080}"

echo "============================================"
echo "  VULT ID - Configuración Inicial v2.0.0"
echo "============================================"
echo ""

# 1. Verificar que la API está corriendo
echo "[1/5] Verificando API..."
HEALTH=$(curl -s "$API_URL/health")
if echo "$HEALTH" | grep -q '"status":"UP"'; then
    echo "      ✅ API funcionando correctamente"
else
    echo "      ❌ API no disponible. Ejecuta: docker-compose up -d"
    exit 1
fi

# 2. Verificar conexión a BD
DB_STATUS=$(echo "$HEALTH" | grep -o '"database":"[^"]*"' | cut -d'"' -f4)
if [ "$DB_STATUS" = "connected" ]; then
    echo "      ✅ Base de datos conectada"
else
    echo "      ❌ Base de datos no disponible"
    exit 1
fi

echo ""
echo "[2/5] Creando suscriptores demo..."

# Suscriptor 1: LOGIN TEST (el que usa el iframe principal)
curl -s -X POST "$API_URL/api/suscriptores" \
  -H "Content-Type: application/json" \
  -d '{
    "faceapp_id": "6efd17c7-295c-4a96-990b-6d4abd28716f",
    "faceapp_tipo": 0,
    "faceapp_auth_method": "bearer",
    "faceapp_url_api": null,
    "faceapp_url_redirect": null,
    "faceapp_token_api": null,
    "faceapp_auth_username": null,
    "faceapp_origin_allowed": "*",
    "faceapp_match_threshold": 0.55,
    "faceapp_es_demo": true
  }' > /dev/null 2>&1 && echo "      ✅ LOGIN TEST (6efd17c7...)" || echo "      ⚠️  LOGIN TEST ya existe"

# Suscriptor 2: DUI VERIFICATION
curl -s -X POST "$API_URL/api/suscriptores" \
  -H "Content-Type: application/json" \
  -d '{
    "faceapp_id": "24095330-2c7b-451e-a693-01e8a5904bc1",
    "faceapp_tipo": 1,
    "faceapp_auth_method": "bearer",
    "faceapp_url_api": null,
    "faceapp_url_redirect": null,
    "faceapp_token_api": null,
    "faceapp_auth_username": null,
    "faceapp_origin_allowed": "*",
    "faceapp_match_threshold": 0.6,
    "faceapp_es_demo": true
  }' > /dev/null 2>&1 && echo "      ✅ DUI VERIFICATION (24095330...)" || echo "      ⚠️  DUI VERIFICATION ya existe"

# Suscriptor 3: LOGIN INTRANET (producción)
curl -s -X POST "$API_URL/api/suscriptores" \
  -H "Content-Type: application/json" \
  -d '{
    "faceapp_id": "56D5F62E-D9CC-4FD8-98F2-7A96A6020D96",
    "faceapp_tipo": 0,
    "faceapp_auth_method": "bearer",
    "faceapp_url_api": null,
    "faceapp_url_redirect": "https://www.ejemplo.com/login-exitoso",
    "faceapp_token_api": "TU_TOKEN_AQUI",
    "faceapp_auth_username": null,
    "faceapp_origin_allowed": "https://tu-dominio.com",
    "faceapp_match_threshold": 0.6,
    "faceapp_es_demo": false
  }' > /dev/null 2>&1 && echo "      ✅ LOGIN INTRANET (56D5F62E...)" || echo "      ⚠️  LOGIN INTRANET ya existe"

echo ""
echo "[3/5] Verificando suscriptores creados..."
SUSCRIPTORES=$(curl -s "$API_URL/api/suscriptores" | grep -o '"faceapp_id":"[^"]*"' | wc -l)
echo "      📊 Total suscriptores: $SUSCRIPTORES"

echo ""
echo "[4/5] Probando endpoint de demo..."
DEMO_RESULT=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/6efd17c7-295c-4a96-990b-6d4abd28716f")
if [ "$DEMO_RESULT" = "200" ]; then
    echo "      ✅ Endpoint demo respondiendo (HTTP 200)"
else
    echo "      ⚠️  Endpoint demo retornó HTTP $DEMO_RESULT"
fi

echo ""
echo "[5/5] Configuración completada!"
echo ""
echo "============================================"
echo "  URLs de Acceso"
echo "============================================"
echo ""
echo "  Dashboard:    $DASHBOARD_URL"
echo "  Admin Panel:  $DASHBOARD_URL/admin.html"
echo "  API:          $API_URL"
echo "  Health:       $API_URL/health"
echo ""
echo "============================================"
echo "  Suscriptores Demo"
echo "============================================"
echo ""
echo "  LOGIN TEST (iframe principal):"
echo "    UUID: 6efd17c7-295c-4a96-990b-6d4abd28716f"
echo "    Tipo: Login Facial (demo)"
echo ""
echo "  DUI VERIFICATION:"
echo "    UUID: 24095330-2c7b-451e-a693-01e8a5904bc1"
echo "    Tipo: Verificación de Identidad (demo)"
echo ""
echo "  LOGIN INTRANET (producción):"
echo "    UUID: 56D5F62E-D9CC-4FD8-98F2-7A96A6020D96"
echo "    Tipo: Login Facial (configurar token y URL)"
echo ""
echo "============================================"
echo "  Próximos Pasos"
echo "============================================"
echo ""
echo "  1. Abre $DASHBOARD_URL en tu navegador"
echo "  2. Haz clic en 'LOGIN TEST' en el sidebar"
echo "  3. Sube una foto de perfil y prueba el flujo"
echo "  4. Para producción, edita el suscriptor en Admin Panel"
echo ""

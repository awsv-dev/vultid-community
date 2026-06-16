# VULT ID - Script de Configuración Inicial (Windows PowerShell)
# Ejecutar después de levantar docker-compose up -d

$ErrorActionPreference = "SilentlyContinue"

$API_URL = $env:API_URL -replace '^.+$', '$0' 
if (-not $API_URL) { $API_URL = "http://localhost:8105" }

$DASHBOARD_URL = $env:DASHBOARD_URL
if (-not $DASHBOARD_URL) { $DASHBOARD_URL = "http://localhost:8080" }

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  VULT ID - Configuración Inicial v2.0.0" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# 1. Verificar que la API está corriendo
Write-Host "[1/5] Verificando API..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$API_URL/health" -TimeoutSec 5
    if ($health.status -eq "UP") {
        Write-Host "      ✅ API funcionando correctamente" -ForegroundColor Green
    } else {
        Write-Host "      ❌ API con problemas" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "      ❌ API no disponible. Ejecuta: docker-compose up -d" -ForegroundColor Red
    exit 1
}

# 2. Verificar conexión a BD
$dbStatus = $health.services.database
if ($dbStatus -eq "connected") {
    Write-Host "      ✅ Base de datos conectada" -ForegroundColor Green
} else {
    Write-Host "      ❌ Base de datos no disponible" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[2/5] Creando suscriptores demo..." -ForegroundColor Yellow

# Suscriptor 1: LOGIN TEST (el que usa el iframe principal)
$body1 = @{
    faceapp_id = "6efd17c7-295c-4a96-990b-6d4abd28716f"
    faceapp_tipo = 0
    faceapp_auth_method = "bearer"
    faceapp_url_api = $null
    faceapp_url_redirect = $null
    faceapp_token_api = $null
    faceapp_auth_username = $null
    faceapp_origin_allowed = "*"
    faceapp_match_threshold = 0.55
    faceapp_es_demo = $true
} | ConvertTo-Json

try {
    $result1 = Invoke-RestMethod -Uri "$API_URL/api/suscriptores" -Method POST -Body $body1 -ContentType "application/json"
    if ($result1.success) { Write-Host "      ✅ LOGIN TEST (6efd17c7...)" -ForegroundColor Green }
    else { Write-Host "      ⚠️  LOGIN TEST ya existe" -ForegroundColor DarkYellow }
} catch { Write-Host "      ⚠️  LOGIN TEST ya existe" -ForegroundColor DarkYellow }

# Suscriptor 2: DUI VERIFICATION
$body2 = @{
    faceapp_id = "24095330-2c7b-451e-a693-01e8a5904bc1"
    faceapp_tipo = 1
    faceapp_auth_method = "bearer"
    faceapp_url_api = $null
    faceapp_url_redirect = $null
    faceapp_token_api = $null
    faceapp_auth_username = $null
    faceapp_origin_allowed = "*"
    faceapp_match_threshold = 0.6
    faceapp_es_demo = $true
} | ConvertTo-Json

try {
    $result2 = Invoke-RestMethod -Uri "$API_URL/api/suscriptores" -Method POST -Body $body2 -ContentType "application/json"
    if ($result2.success) { Write-Host "      ✅ DUI VERIFICATION (24095330...)" -ForegroundColor Green }
    else { Write-Host "      ⚠️  DUI VERIFICATION ya existe" -ForegroundColor DarkYellow }
} catch { Write-Host "      ⚠️  DUI VERIFICATION ya existe" -ForegroundColor DarkYellow }

# Suscriptor 3: LOGIN INTRANET (producción)
$body3 = @{
    faceapp_id = "56D5F62E-D9CC-4FD8-98F2-7A96A6020D96"
    faceapp_tipo = 0
    faceapp_auth_method = "bearer"
    faceapp_url_api = $null
    faceapp_url_redirect = "https://www.ejemplo.com/login-exitoso"
    faceapp_token_api = "TU_TOKEN_AQUI"
    faceapp_auth_username = $null
    faceapp_origin_allowed = "https://tu-dominio.com"
    faceapp_match_threshold = 0.6
    faceapp_es_demo = $false
} | ConvertTo-Json

try {
    $result3 = Invoke-RestMethod -Uri "$API_URL/api/suscriptores" -Method POST -Body $body3 -ContentType "application/json"
    if ($result3.success) { Write-Host "      ✅ LOGIN INTRANET (56D5F62E...)" -ForegroundColor Green }
    else { Write-Host "      ⚠️  LOGIN INTRANET ya existe" -ForegroundColor DarkYellow }
} catch { Write-Host "      ⚠️  LOGIN INTRANET ya existe" -ForegroundColor DarkYellow }

Write-Host ""
Write-Host "[3/5] Verificando suscriptores creados..." -ForegroundColor Yellow
$suscriptores = Invoke-RestMethod -Uri "$API_URL/api/suscriptores"
$count = ($suscriptores.data | Measure-Object).Count
Write-Host "      📊 Total suscriptores: $count" -ForegroundColor Cyan

Write-Host ""
Write-Host "[4/5] Probando endpoint de demo..." -ForegroundColor Yellow
try {
    $demoResult = Invoke-WebRequest -Uri "$API_URL/6efd17c7-295c-4a96-990b-6d4abd28716f" -TimeoutSec 5
    Write-Host "      ✅ Endpoint demo respondiendo (HTTP $($demoResult.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "      ⚠️  Endpoint demo retornó error" -ForegroundColor DarkYellow
}

Write-Host ""
Write-Host "[5/5] Configuración completada!" -ForegroundColor Green

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  URLs de Acceso" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Dashboard:    $DASHBOARD_URL" -ForegroundColor White
Write-Host "  Admin Panel:  $DASHBOARD_URL/admin.html" -ForegroundColor White
Write-Host "  API:          $API_URL" -ForegroundColor White
Write-Host "  Health:       $API_URL/health" -ForegroundColor White
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Suscriptores Demo" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  LOGIN TEST (iframe principal):" -ForegroundColor Yellow
Write-Host "    UUID: 6efd17c7-295c-4a96-990b-6d4abd28716f" -ForegroundColor White
Write-Host "    Tipo: Login Facial (demo)" -ForegroundColor Gray
Write-Host ""
Write-Host "  DUI VERIFICATION:" -ForegroundColor Yellow
Write-Host "    UUID: 24095330-2c7b-451e-a693-01e8a5904bc1" -ForegroundColor White
Write-Host "    Tipo: Verificación de Identidad (demo)" -ForegroundColor Gray
Write-Host ""
Write-Host "  LOGIN INTRANET (producción):" -ForegroundColor Yellow
Write-Host "    UUID: 56D5F62E-D9CC-4FD8-98F2-7A96A6020D96" -ForegroundColor White
Write-Host "    Tipo: Login Facial (configurar token y URL)" -ForegroundColor Gray
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Próximos Pasos" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  1. Abre $DASHBOARD_URL en tu navegador" -ForegroundColor White
Write-Host "  2. Haz clic en 'LOGIN TEST' en el sidebar" -ForegroundColor White
Write-Host "  3. Sube una foto de perfil y prueba el flujo" -ForegroundColor White
Write-Host "  4. Para producción, edita el suscriptor en Admin Panel" -ForegroundColor White
Write-Host ""

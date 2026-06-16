# VULT ID Community v2.0

Motor de Biometria Facial con verificacion de identidad y reconocimiento facial.
Self-hosted, open-source (MIT). Docker-ready.

## Arquitectura

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    Dashboard    │────▶│     API Node    │────▶│   PostgreSQL    │
│    (Nginx)      │     │  (Express.js)   │     │      (BD)       │
│   Puerto: 8080  │     │  Puerto: 8105   │     │  Puerto: 5432   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │
        │     ┌─────────────────┘
        │     │
        ▼     ▼
   ┌─────────────────┐
│   Iframe App    │
│  (face-api.js)  │
│  Camara + OCR   │
└─────────────────┘
```

## Incluido en Community

- Motor de reconocimiento facial (login)
- Verificacion de identidad con DUI (OCR + face match)
- Admin Panel para gestionar suscriptores
- 7 modos de liveness: smile, surprise, mouth_open, head_movement, button, button:gesture, button:head_movement
- Dashboard de demostracion para pruebas
- Docker compose (3 contenedores)
- Esquema PostgreSQL con migraciones
- API REST completa (CRUD suscriptores, endpoints biométricos)

## Requisitos Previos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) v4.0+
- 4GB de RAM minimo para Docker
- Puertos 5432, 8080 y 8105 disponibles

## Instalacion Rapida

### 1. Clonar el repositorio

```bash
git clone https://github.com/awsv-dev/vultid-community.git
cd vultid-community
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
# Editar .env con tus valores
```

### 3. Levantar servicios

```bash
docker-compose up -d
```

Esto levantara:
- **vultid-db**: PostgreSQL 16 (puerto 5432)
- **vultid-api**: Node.js API (puerto 8105)
- **vultid-dashboard**: Nginx dashboard (puerto 8080)

### 4. Configuracion inicial

**Windows (PowerShell):**
```powershell
.\setup.ps1
```

**Linux/Mac:**
```bash
chmod +x setup.sh
./setup.sh
```

### 5. Acceder

- **Dashboard**: http://localhost:8080
- **Admin Panel**: http://localhost:8080/admin.html
- **API Health**: http://localhost:8105/health

## Suscriptores Demo

| Nombre | UUID | Tipo | Modo |
|--------|------|------|------|
| LOGIN TEST | `6efd17c7-295c-4a96-990b-6d4abd28716f` | Login Facial | Demo |
| DUI VERIFICATION | `24095330-2c7b-451e-a693-01e8a5904bc1` | Verificacion ID | Demo |
| LOGIN INTRANET | `56D5F62E-D9CC-4FD8-98F2-7A96A6020D96` | Login Facial | Produccion |

## Modos de Liveness

| Modo | Descripcion | Disparo |
|------|-------------|---------|
| Sonrisa | Detecta sonrisa >= 95% | Automatico |
| Sorpresa | Detecta sorpresa >= 90% | Automatico |
| Boca Abierta | Detecta boca abierta >= 85% | Automatico |
| Mov. Cabeza | Mueve cabeza izq/der | Automatico |
| Boton | Captura manual sin liveness | Manual |
| Boton + Gesto | Presiona boton, luego sonrie | Manual + auto |
| Boton + Cabeza | Presiona boton, luego mueve cabeza | Manual + auto |

## API Endpoints

### Publicos

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/:uuid` | Carga app HTML del iframe |
| POST | `/login-user-test/:uuid` | Demo login facial |
| POST | `/recognize/:uuid` | Reconocimiento facial |
| POST | `/verify-id/:uuid` | Verificacion de identidad |

### Admin (Dashboard)

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| GET | `/api/suscriptores` | Listar suscriptores |
| POST | `/api/suscriptores` | Crear suscriptor |
| PUT | `/api/suscriptores/:uuid` | Actualizar suscriptor |
| DELETE | `/api/suscriptores/:uuid` | Desactivar suscriptor |

## Estructura del Proyecto

```
vultid-community/
├── docker-compose.yml
├── .env                    # Variables de entorno (NO commitear credenciales)
├── setup.ps1               # Script config (Windows)
├── setup.sh                # Script config (Linux/Mac)
│
├── server/                 # API Node.js
│   ├── Dockerfile
│   ├── app.js              # Servidor principal
│   ├── package.json
│   ├── db/
│   │   ├── schema.sql
│   │   ├── connection.js
│   │   ├── queries.js
│   │   └── migration_trigger_type.sql
│   ├── models/             # Modelos face-api.js (Git LFS)
│   └── public/             # Archivos del iframe
│       ├── app.html        # App principal
│       ├── css/
│       ├── images/
│       ├── js/
│       ├── lib/
│       └── mrz-scanner/
│
└── dashboard/              # Dashboard
    ├── Dockerfile
    ├── nginx.conf
    ├── index.html          # Dashboard principal
    └── admin.html          # Panel de administracion
```

## Integrar en tu Sitio

```html
<iframe
    id="vultid-tool"
    src="https://tu-api:8105/TU-UUID"
    allow="camera *;"
    style="width: 100%; border: none; min-height: 250px;">
</iframe>

<script>
    const vultidFrame = document.getElementById('vultid-tool');
    const VULTID_ORIGIN = "https://tu-api:8105";

    window.addEventListener('message', function(event) {
        if (event.origin !== VULTID_ORIGIN) return;

        const { type, payload } = event.data;

        if (type === 'FACE_RECOGNITION_SUCCESS') {
            console.log("Login exitoso:", payload);
        }

        if (type === 'FACE_VERIFICATION_SUCCESS') {
            console.log("Verificacion exitosa:", payload);
        }
    }, false);
</script>
```

## Variables de Entorno

```env
# PostgreSQL
POSTGRES_DB=vultid
POSTGRES_USER=vultid
POSTGRES_PASSWORD=cambiar_en_produccion

# Puertos
DB_PORT=5432
API_PORT=8105
DASHBOARD_PORT=8080

# CORS (cambiar en produccion)
FACEAPI_ORIGIN_ALLOWED=*

# Endpoints internos
DEMOGNITION_ENDPOINT=/login-user-test/
RECOGNITION_ENDPOINT=/recognize/
VERIFICATION_ENDPOINT=/verify-id/
```

## Comandos Utiles

```bash
# Iniciar
docker-compose up -d

# Logs
docker logs vultid-api -f
docker logs vultid-db -f

# Reiniciar API
docker-compose restart api

# Detener
docker-compose down

# Reset completo (elimina BD)
docker-compose down -v

# Reconstruir
docker-compose up -d --build
```

## Solucion de Problemas

### API no inicia
```bash
docker logs vultid-api
```
Verificar PostgreSQL healthy: `docker ps`

### Dashboard no carga iframe
Verificar API en puerto 8105. Abrir consola navegador (F12).

### Error conexion BD
```bash
docker-compose restart db
sleep 10
docker-compose restart api
```

## Licencia

MIT License - Ver [LICENSE](LICENSE) para detalles.

Copyright (c) 2025 awsv-dev

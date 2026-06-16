require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const faceapi = require('@vladmandic/face-api');
const canvas = require('canvas');
const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const fetch = require('node-fetch');
const { Canvas, Image, ImageData } = canvas;
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });
const mrzScan = require('mrz-scan');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const db = require('./db/connection');
const queries = require('./db/queries');
const { adminAuthMiddleware } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const subscriptionRoutes = require('./routes/subscriptions');
const licenseRoutes = require('./routes/licenses');
const wompiRoutes = require('./routes/wompi');

const app = express();
const PORT = process.env.PORT || 8105;
const MODEL_URL = path.join(__dirname, 'models');
const FACE_MATCH_THRESHOLD_DEFAULT = 0.6;

// --- CACHE EN MEMORIA ---
const CACHE_TTL_MS = (parseInt(process.env.CACHE_TTL_MINUTES) || 60) * 60 * 1000;
const faceMatchersPorUUID = {};
const datosUsuariosPorUUID = {};
const cacheLoadDatePorUUID = {};
const configCachePorUUID = {};

// --- RATE LIMITING SIMPLE ---
const rateLimitStore = {};
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 120;

function rateLimit(ip) {
    const now = Date.now();
    if (!rateLimitStore[ip] || now - rateLimitStore[ip].start > RATE_LIMIT_WINDOW_MS) {
        rateLimitStore[ip] = { start: now, count: 1 };
        return { allowed: true, retryAfter: 0 };
    }
    rateLimitStore[ip].count++;
    if (rateLimitStore[ip].count > RATE_LIMIT_MAX) {
        const retryAfter = Math.ceil((RATE_LIMIT_WINDOW_MS - (now - rateLimitStore[ip].start)) / 1000);
        return { allowed: false, retryAfter };
    }
    return { allowed: true, retryAfter: 0 };
}

setInterval(() => {
    const now = Date.now();
    for (const ip in rateLimitStore) {
        if (now - rateLimitStore[ip].start > RATE_LIMIT_WINDOW_MS * 2) {
            delete rateLimitStore[ip];
        }
    }
}, RATE_LIMIT_WINDOW_MS * 2);

// --- MIDDLEWARE ---
const allowedOrigins = (process.env.FACEAPI_ORIGIN_ALLOWED || '*').split(',').map(s => s.trim());

app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Origen no permitido por CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400
}));

app.use((req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const result = rateLimit(ip);
    if (!result.allowed) {
        res.set('Retry-After', String(result.retryAfter));
        if (req.accepts('html') && !req.xhr && !req.path.startsWith('/api/')) {
            return res.status(429).send(`
                <!DOCTYPE html>
                <html lang="es">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>VULT ID - Demasiadas Peticiones</title>
                    <meta http-equiv="refresh" content="${result.retryAfter}">
                    <style>
                        body {
                            background-color: #0d1117;
                            color: #5bfce9;
                            display: flex;
                            flex-direction: column;
                            justify-content: center;
                            align-items: center;
                            height: 100vh;
                            font-family: 'Inter', sans-serif;
                            margin: 0;
                        }
                        .loader {
                            border: 4px solid rgba(255, 255, 255, 0.1);
                            border-top-color: #5bfce9;
                            border-radius: 50%;
                            width: 50px;
                            height: 50px;
                            animation: spin 1s linear infinite;
                            margin-bottom: 20px;
                        }
                        @keyframes spin {
                            to { transform: rotate(360deg); }
                        }
                        .message {
                            font-size: 1.1rem;
                            text-align: center;
                        }
                        .sub-message {
                            font-size: 0.85rem;
                            color: #8b949e;
                            margin-top: 8px;
                        }
                    </style>
                </head>
                <body>
                    <div class="loader"></div>
                    <div class="message">Preparando entorno seguro...</div>
                    <div class="sub-message">Reconectando de forma automática en breve.</div>
                </body>
                </html>
            `);
        } else {
            return res.status(429).json({ success: false, error: 'Demasiadas peticiones', retryAfter: result.retryAfter });
        }
    }
    next();
});

app.set('trust proxy', true);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '5mb', extended: true }));
app.use(cookieParser());
app.use(express.static('public'));
app.use('/models', express.static(path.join(__dirname, 'models')));

// --- LOGGING SIMPLE ---
function log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const entry = { timestamp, level, message, ...(data && { data }) };
    if (level === 'ERROR') {
        console.error(JSON.stringify(entry));
    } else if (level === 'WARN') {
        console.warn(JSON.stringify(entry));
    } else {
        console.log(JSON.stringify(entry));
    }
}

// --- ENDPOINTS ---

app.get('/health', async (req, res) => {
    const dbOk = await db.testConnection();
    res.json({
        status: dbOk ? 'UP' : 'DEGRADED',
        timestamp: new Date().toISOString(),
        version: '2.0.0',
        services: {
            database: dbOk ? 'connected' : 'disconnected',
            faceapi: 'loaded'
        }
    });
});

app.get('/', (req, res) => {
    res.json({
        status: 'UP',
        message: 'VULT ID API v2.0 - Motor de Biometría Facial',
        version: '2.0.0',
        endpoints: {
            health: 'GET /health',
            configuracion: 'GET /:uuid',
            reconocimiento: 'POST /recognize/:uuid',
            verificacion: 'POST /verify-id/:uuid',
            demo: 'POST /login-user-test/:uuid',
            auth: 'POST /api/auth/register, /api/auth/login, /api/auth/refresh',
            plans: 'GET /api/subscriptions/plans',
            admin_suscriptores: 'GET /api/suscriptores (admin auth required)'
        }
    });
});

// --- AUTH ROUTES ---
app.use('/api/auth', authRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/licenses', licenseRoutes);
app.use('/api/wompi', wompiRoutes);

// --- ADMIN ROUTES (protected) ---
app.get('/api/suscriptores', adminAuthMiddleware, async (req, res) => {
    try {
        const suscriptores = await queries.listSuscriptores();
        res.json({ success: true, data: suscriptores });
    } catch (error) {
        log('ERROR', 'Error listando suscriptores', { error: error.message });
        res.status(500).json({ success: false, error: 'Error al obtener suscriptores.' });
    }
});

app.post('/api/suscriptores', adminAuthMiddleware, async (req, res) => {
    try {
        const nuevo = await queries.createSuscriptor(req.body);
        log('INFO', 'Suscriptor creado', { faceapp_id: nuevo.faceapp_id });
        res.status(201).json({ success: true, data: nuevo });
    } catch (error) {
        log('ERROR', 'Error creando suscriptor', { error: error.message });
        res.status(500).json({ success: false, error: 'Error al crear suscriptor.' });
    }
});

app.put('/api/suscriptores/:uuid', adminAuthMiddleware, async (req, res) => {
    try {
        const actualizado = await queries.updateSuscriptor(req.params.uuid, req.body);
        if (!actualizado) return res.status(404).json({ success: false, error: 'Suscriptor no encontrado.' });
        delete configCachePorUUID[req.params.uuid];
        log('INFO', 'Suscriptor actualizado', { faceapp_id: req.params.uuid });
        res.json({ success: true, data: actualizado });
    } catch (error) {
        log('ERROR', 'Error actualizando suscriptor', { error: error.message });
        res.status(500).json({ success: false, error: 'Error al actualizar suscriptor.' });
    }
});

app.delete('/api/suscriptores/:uuid', adminAuthMiddleware, async (req, res) => {
    try {
        const eliminado = await queries.deleteSuscriptor(req.params.uuid);
        if (!eliminado) return res.status(404).json({ success: false, error: 'Suscriptor no encontrado.' });
        delete configCachePorUUID[req.params.uuid];
        log('INFO', 'Suscriptor desactivado', { faceapp_id: req.params.uuid });
        res.json({ success: true, message: 'Suscriptor desactivado.' });
    } catch (error) {
        log('ERROR', 'Error eliminando suscriptor', { error: error.message });
        res.status(500).json({ success: false, error: 'Error al eliminar suscriptor.' });
    }
});

app.get('/:uuid', async (req, res) => {
    const uuid = req.params.uuid;
    if (uuid === 'health' || uuid === 'api') return;

    const configSuscriptor = await obtenerConfiguracion(uuid);

    if (!configSuscriptor) {
        return res.status(404).send(`
            <h1>Error 404: Suscriptor no encontrado.</h1>
            <p>El UUID ${uuid} no tiene configuración asociada.</p>
        `);
    }

    const configAInyectar = {
        tipo: configSuscriptor.tipo,
        origin_allowed: configSuscriptor.origin_allowed,
        liveness_type: configSuscriptor.liveness_type || 'smile',
        show_landmarks: configSuscriptor.show_landmarks !== false,
        show_expressions: configSuscriptor.show_expressions !== false,
        es_demo: !!configSuscriptor.es_demo
    };

    fs.readFile(path.join(__dirname, 'public', 'app.html'), 'utf8', (err, htmlContent) => {
        if (err) {
            log('ERROR', 'Error al leer app.html', { error: err.message });
            return res.status(500).send('Error interno al cargar la página de captura.');
        }

        const injectedScript = `
            <script>
                const uuid = "${uuid}";
                const suscriptorConfig = ${JSON.stringify(configAInyectar)};
                const IS_DEMO_MODE = ${!!configSuscriptor.es_demo};
                const APP_ORIGIN = "${configSuscriptor.origin_allowed}";
                const BASE_DEMOGNITION_ENDPOINT = "${process.env.DEMOGNITION_ENDPOINT}";
                const BASE_RECOGNITION_ENDPOINT = "${process.env.RECOGNITION_ENDPOINT}";
                const BASE_VERIFICATION_ENDPOINT = "${process.env.VERIFICATION_ENDPOINT}";
                const MODEL_URL = "./models";
            </script>
        `;

        const modifiedHtml = htmlContent.replace('</head>', `${injectedScript}</head>`);
        res.send(modifiedHtml);
    });
});

app.post('/login-user-test/:uuid', async (req, res) => {
    const { uuid } = req.params;
    const { img_webcam, foto_perfil, is_liveness_check_ok } = req.body;

    if (!img_webcam || !foto_perfil) return res.status(400).json({ success: false, error: 'Faltan imágenes para la comparación.' });
    if (!is_liveness_check_ok) return res.json({ success: false, match: false, message: 'Fallo en Prueba de Vida (Demo).' });

    try {
        const imageRef = await base64ToImage(foto_perfil);
        const detectionRef = await faceapi.detectSingleFace(imageRef, new faceapi.SsdMobilenetv1Options())
            .withFaceLandmarks().withFaceDescriptor();

        if (!detectionRef) return res.json({ success: false, message: 'No se detectó rostro en tu foto de perfil.' });

        const miUsuario = {
            id: "A62B904F-8C1D-D3M0-942E-7B5A0C3F91D2",
            nombre_usuario: "aris_vexel",
            nombres: "Aris Elenai",
            apellidos: "Vexel Kaltreem",
            descriptor: detectionRef.descriptor,
            url_redirect: "http://localhost/demo-success"
        };
        const usuariosDemo = generarUsuariosDemo(miUsuario);

        const labeledDescriptors = usuariosDemo.map(u => {
            return new faceapi.LabeledFaceDescriptors(`${u.nombres} (${u.nombre_usuario})`, [u.descriptor]);
        });
        const localMatcher = new faceapi.FaceMatcher(labeledDescriptors, FACE_MATCH_THRESHOLD_DEFAULT);

        const webcamImage = await base64ToImage(img_webcam);
        const webcamDetection = await faceapi.detectSingleFace(webcamImage, new faceapi.SsdMobilenetv1Options())
            .withFaceLandmarks().withFaceDescriptor();

        if (!webcamDetection) return res.json({ success: false, message: 'La cámara no detecta tu rostro.' });

        const bestMatch = localMatcher.findBestMatch(webcamDetection.descriptor);
        const isMatch = bestMatch.distance < FACE_MATCH_THRESHOLD_DEFAULT;

        if (isMatch) {
            const matchedUser = usuariosDemo.find(u => bestMatch.label.includes(`(${u.nombre_usuario})`));
            return res.json({
                success: true,
                match: true,
                message: "¡Demo exitosa! Usuario reconocido entre 51 candidatos.",
                payload: {
                    user_info: {
                        ...matchedUser,
                        distancia: bestMatch.distance.toFixed(4),
                        confianza: ((1 - bestMatch.distance) * 100).toFixed(2) + "%"
                    },
                    total_procesados: usuariosDemo.length,
                    timestamp: new Date().toISOString()
                },
                url_redirect: matchedUser.url_redirect
            });
        }

        return res.json({ success: false, match: false, message: 'Rostro no reconocido en la lista de la demo.', distance: bestMatch.distance });

    } catch (error) {
        log('ERROR', 'Error en login-user-test', { uuid, error: error.message });
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/recognize/:uuid', async (req, res) => {
    const uuid = req.params.uuid;
    const { img_webcam, is_liveness_check_ok } = req.body;

    if (!faceMatchersPorUUID[uuid]) {
        const success = await crearFaceMatcher(uuid);
        if (!success) {
            return res.status(500).json({ success: false, error: 'Error interno: No hay datos de rostros válidos para la comparación.' });
        }
    }

    const usuariosEnCache = datosUsuariosPorUUID[uuid];
    if (!usuariosEnCache) {
        return res.status(500).json({ success: false, error: 'Error interno: Datos de usuario no encontrados en la caché después de cargar.' });
    }

    if (!img_webcam) return res.status(400).json({ success: false, error: 'Falta la imagen de la webcam (img_webcam).' });
    if (!is_liveness_check_ok) return res.json({ success: false, match: false, message: 'Fallo en la Prueba de Vida. Inténtelo de nuevo.' });

    try {
        const faceMatcher = faceMatchersPorUUID[uuid];
        const webcamImage = await base64ToImage(img_webcam);
        const webcamDetection = await faceapi.detectSingleFace(webcamImage, new faceapi.SsdMobilenetv1Options())
            .withFaceLandmarks().withFaceDescriptor();

        if (!webcamDetection) {
            return res.json({ success: false, match: false, message: 'No se detectó un rostro en la imagen de la webcam.' });
        }

        const bestMatch = faceMatcher.findBestMatch(webcamDetection.descriptor);
        const isMatch = bestMatch.distance < FACE_MATCH_THRESHOLD_DEFAULT;

        if (isMatch) {
            const userLabel = bestMatch.label;
            const matchedUser = usuariosEnCache.find(u => userLabel.includes(`(${u.nombre_usuario})`));

            if (!matchedUser) {
                return res.status(500).json({ success: false, error: 'Error interno: Usuario reconocido pero datos no encontrados.' });
            }

            const { id, url_redirect, nombre_usuario, nombres, apellidos, foto_perfil, configSuscriptor, ...datosExtra } = matchedUser;

            log('INFO', 'Reconocimiento exitoso', { uuid, usuario: nombre_usuario, distancia: bestMatch.distance });

            return res.json({
                success: true,
                match: true,
                label: matchedUser.nombres,
                message: '¡Autenticación exitosa!',
                payload: {
                    user_info: {
                        id, nombre_usuario, nombres, apellidos, foto_perfil,
                        distancia: bestMatch.distance.toFixed(4),
                        confianza: ((1 - bestMatch.distance) * 100).toFixed(2) + "%",
                    },
                    custom: datosExtra,
                    timestamp: new Date().toISOString()
                },
                url_redirect: matchedUser.url_redirect
            });
        }

        return res.json({ success: false, match: false, label: 'Desconocido', distance: bestMatch.distance, message: 'Rostro no reconocido en la base de datos.' });
    } catch (error) {
        log('ERROR', 'Error durante el reconocimiento', { uuid, error: error.message });
        return res.status(500).json({ success: false, error: 'Error interno del servidor al procesar el reconocimiento.' });
    }
});

app.post('/verify-id/:uuid', async (req, res) => {
    const { img_webcam, img_doc_front, img_doc_back, is_liveness_check_ok, dui_esperado } = req.body;
    const uuid = req.params.uuid;
    let bestMatch;

    if (!isValidImage(img_webcam) || !isValidImage(img_doc_front)) {
        return res.status(400).json({ success: false, message: "El formato de imagen enviado no es válido o está corrupto." });
    }

    try {
        const mensaje = '<h3>Advertencia:</h3>La Ley Especial Contra los Delitos Informáticos y Conexos establece en su artículo 22, "El que suplantare o se apropiare de la identidad de una persona natural o jurídica por medio de las Tecnologías de la Información y la Comunicación, será sancionada con prisión de tres a cinco años"';

        const configSuscriptor = await obtenerConfiguracion(uuid);
        if (!configSuscriptor) {
            return res.status(404).json({ success: false, message: 'Configuración del suscriptor no encontrada.' });
        }

        try {
            const imageWebcam = await base64ToImage(img_webcam);
            const imageDui = await base64ToImage(img_doc_front);

            const fullFaceDescriptionWebcam = await faceapi.detectSingleFace(imageWebcam).withFaceLandmarks().withFaceDescriptor();
            const fullFaceDescriptionDui = await faceapi.detectSingleFace(imageDui).withFaceLandmarks().withFaceDescriptor();

            if (!fullFaceDescriptionWebcam || !fullFaceDescriptionDui) {
                return res.status(400).json({ success: false, message: 'No se detectó un rostro claro en alguna de las imágenes.' });
            }

            const faceMatcher = new faceapi.FaceMatcher(fullFaceDescriptionDui);
            bestMatch = faceMatcher.findBestMatch(fullFaceDescriptionWebcam.descriptor);

            const distanciaObtenida = bestMatch.distance;
            const match_threshold = configSuscriptor.match_threshold || FACE_MATCH_THRESHOLD_DEFAULT;

            if (bestMatch.label === 'unknown' || distanciaObtenida > match_threshold) {
                log('WARN', 'Verificación facial fallida', { uuid, distancia: distanciaObtenida });
                return res.status(400).json({ success: false, match: false, icon: 'warning', title: '¡IDENTIDAD NO COINCIDE!', message: mensaje });
            }
        } catch (faceError) {
            log('ERROR', 'Error crítico en el motor facial', { uuid, error: faceError.message });
            return res.status(500).json({ success: false, message: 'Error en el procesamiento biométrico del servidor.' });
        }

        const fechaActual = new Date();
        let clientData = null;
        let duiExtraidoMRZ = null;
        let fechaExpiracion = null;
        let fechaNac = null;

        if (img_doc_back) {
            try {
                const base64Data = img_doc_back.replace(/^data:image\/\w+;base64,/, '');
                const imageBuffer = Buffer.from(base64Data, 'base64');
                clientData = await mrzScan(imageBuffer, { original: true });
                duiExtraidoMRZ = clientData.fields.documentNumber.replace('<', '').trim();
                fechaExpiracion = parseMRZDate(clientData.fields.expirationDate);
                fechaNac = parseMRZDate(clientData.fields.birthDate);

                fechaActual.setHours(0, 0, 0, 0);

                if (fechaExpiracion < fechaActual) {
                    return res.status(400).json({ success: false, icon: 'error', title: 'DOCUMENTO VENCIDO', message: `Tu DUI expiró el ${fechaExpiracion.toLocaleDateString()}. No puedes actualizar datos con un documento no vigente.` });
                }

                if (dui_esperado !== duiExtraidoMRZ) {
                    return res.status(400).json({ icon: 'warning', title: '¡ACTIVIDAD SOSPECHOSA!', success: false, match: false, message: mensaje });
                }
            } catch (scanError) {
                return res.status(500).json({ icon: 'error', title: 'MRZ ILEGIBLE', success: false, message: 'No fue posible leer el código MRZ del DUI.\nPor favor, vuelve a intentarlo asegurándote de que el documento esté bien enfocado, legible y dentro del área indicada.\n', error: scanError.message });
            }
        }

        const payloadFinal = {
            metadata: { timestamp: new Date().toISOString(), uuid_transaccion: uuid, metodo: "VULTID_V1" },
            usuario: { dui_esperado, dui_extraido_mrz: duiExtraidoMRZ, coincidencia_biometrica: true, distancia_facial: bestMatch.distance },
            documento: { fechaNac, expiracion: fechaExpiracion, es_valido: true, datos_mrz: clientData ? clientData.fields : null },
            evidencia: { img_webcam, img_doc_front, img_doc_back }
        };

        log('INFO', 'Verificación completada', { uuid, exitoso: true, distancia: bestMatch.distance });

        if (configSuscriptor.tipo === 1) {
            return res.json({ success: true, message: '', data: payloadFinal });
        }

        if (configSuscriptor.tipo === 0) {
            return res.json({ success: true, match: true, message: 'Verificación exitosa (modo login)', data: payloadFinal });
        }

        return res.status(400).json({ success: false, message: 'Tipo de configuración no soportado.' });

    } catch (error) {
        log('ERROR', 'Error general en verificación', { uuid, error: error.message });
        res.status(500).json({ icon: 'error', title: 'Error!', success: false, message: 'Error interno del servidor', error: error.message });
    }
});

// --- FUNCIONES AUXILIARES ---

async function base64ToImage(base64String) {
    const base64Data = base64String.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const img = new Image();
    await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error("Imagen base64 inválida"));
        img.src = buffer;
    });
    return img;
}

async function obtenerConfiguracion(uuid) {
    if (configCachePorUUID[uuid]) {
        const cached = configCachePorUUID[uuid];
        if (Date.now() - cached.timestamp < CACHE_TTL_MS) {
            return cached.data;
        }
        delete configCachePorUUID[uuid];
    }

    try {
        const registro = await queries.findSuscriptorByUUID(uuid);
        if (registro) {
            const config = {
                url_api: registro.faceapp_url_api,
                url_redirect: registro.faceapp_url_redirect,
                tipo: registro.faceapp_tipo,
                token_api: registro.faceapp_token_api,
                auth_method: registro.faceapp_auth_method,
                auth_username: registro.faceapp_auth_username,
                origin_allowed: registro.faceapp_origin_allowed || '*',
                match_threshold: registro.faceapp_match_threshold,
                liveness_type: registro.faceapp_liveness_type || 'smile',
                show_landmarks: registro.faceapp_show_landmarks,
                show_expressions: registro.faceapp_show_expressions,
                es_demo: registro.faceapp_es_demo
            };
            configCachePorUUID[uuid] = { data: config, timestamp: Date.now() };
            return config;
        }
    } catch (error) {
        log('ERROR', 'Error consultando BD para config', { uuid, error: error.message });
    }

    if (datosUsuariosPorUUID[uuid]) {
        return { url_api: 'interna', token_api: 'demo-token', tipo: 0, match_threshold: 0.55, liveness_type: 'smile', es_demo: true, origin_allowed: '*' };
    }

    return null;
}

async function obtenerListaUsuarios(config) {
    const { url_api, token_api, auth_method, auth_username } = config;
    const headers = { 'Content-Type': 'application/json' };

    if (auth_method && token_api) {
        const method = auth_method.toLowerCase();
        if (method === 'bearer') {
            headers['Authorization'] = `Bearer ${token_api}`;
        } else if (method === 'basic' && auth_username) {
            headers['Authorization'] = `Basic ${Buffer.from(`${auth_username}:${token_api}`).toString('base64')}`;
        } else {
            headers['X-API-Key'] = token_api;
        }
    }

    try {
        log('INFO', 'Obteniendo lista de usuarios', { url: url_api, method: auth_method || 'none' });
        const response = await fetch(url_api, { headers });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } catch (error) {
        log('ERROR', 'Error al obtener lista de usuarios', { url: url_api, error: error.message });
        return null;
    }
}

async function crearFaceMatcher(uuid) {
    const now = Date.now();
    const lastLoadTime = cacheLoadDatePorUUID[uuid] || 0;

    if (faceMatchersPorUUID[uuid] && (now - lastLoadTime < CACHE_TTL_MS)) {
        log('INFO', `Usando FaceMatcher de caché para ${uuid}`);
        return true;
    }

    const configSuscriptor = await obtenerConfiguracion(uuid);
    if (!configSuscriptor || !configSuscriptor.url_api) {
        log('WARN', `Configuración no encontrada para ${uuid}`);
        return !!faceMatchersPorUUID[uuid];
    }

    const listaUsuarios = await obtenerListaUsuarios(configSuscriptor);
    if (!Array.isArray(listaUsuarios) || listaUsuarios.length === 0) {
        log('WARN', `Lista de usuarios vacía para ${uuid}`);
        return !!faceMatchersPorUUID[uuid];
    }

    log('INFO', `Preprocesando ${listaUsuarios.length} rostros para ${uuid}`);
    const labeledDescriptors = [];
    const usuariosValidos = [];

    for (const user of listaUsuarios) {
        if (!user.foto_perfil) continue;
        try {
            const image = await base64ToImage(user.foto_perfil);
            const descriptor = await faceapi.detectSingleFace(image, new faceapi.SsdMobilenetv1Options())
                .withFaceLandmarks().withFaceDescriptor();

            if (descriptor) {
                const label = `${user.nombres} ${user.apellidos} (${user.nombre_usuario})`;
                labeledDescriptors.push(new faceapi.LabeledFaceDescriptors(label, [descriptor.descriptor]));
                usuariosValidos.push({ ...user, configSuscriptor });
            }
        } catch (e) {
            log('ERROR', `Error procesando foto de ${user.nombre_usuario}`, { error: e.message });
        }
    }

    if (labeledDescriptors.length > 0) {
        faceMatchersPorUUID[uuid] = new faceapi.FaceMatcher(labeledDescriptors, FACE_MATCH_THRESHOLD_DEFAULT);
        datosUsuariosPorUUID[uuid] = usuariosValidos;
        cacheLoadDatePorUUID[uuid] = now;
        log('INFO', `FaceMatcher creado para ${uuid} con ${labeledDescriptors.length} rostros`);
        return true;
    }

    log('ERROR', `No se pudo crear FaceMatcher para ${uuid}`);
    return false;
}

function generarUsuariosDemo(usuarioReal) {
    const nombres = ["Juan", "Maria", "Pedro", "Ana", "Luis", "Elena", "Carlos", "Sofia", "Diego", "Lucia"];
    const apellidos = ["Garcia", "Rodriguez", "Lopez", "Martinez", "Perez", "Gomez", "Sanchez", "Diaz"];
    let lista = [];

    for (let i = 1; i <= 50; i++) {
        const n = nombres[Math.floor(Math.random() * nombres.length)];
        const a = apellidos[Math.floor(Math.random() * apellidos.length)];
        lista.push({
            id: `DEMO-${1000 + i}`,
            nombre_usuario: `${n.toLowerCase()}${i}`,
            nombres: n, apellidos: a,
            descriptor: new Float32Array(128).map(() => Math.random() - 0.5),
            url_redirect: "http://localhost/success"
        });
    }

    lista.push(usuarioReal);
    return lista;
}

function parseMRZDate(mrzDateString) {
    if (!mrzDateString || mrzDateString.length !== 6) return null;
    const yearShort = parseInt(mrzDateString.substring(0, 2));
    const month = parseInt(mrzDateString.substring(2, 4)) - 1;
    const day = parseInt(mrzDateString.substring(4, 6));
    const yearFull = (yearShort < 50) ? 2000 + yearShort : 1900 + yearShort;
    return new Date(yearFull, month, day);
}

async function loadModels() {
    await faceapi.nets.ssdMobilenetv1.loadFromDisk(MODEL_URL);
    await faceapi.nets.faceRecognitionNet.loadFromDisk(MODEL_URL);
    await faceapi.nets.faceLandmark68Net.loadFromDisk(MODEL_URL);
    log('INFO', 'Modelos de face-api.js cargados.');
}

function isValidImage(base64String) {
    if (!base64String.startsWith('data:image/')) return false;
    const mimeType = base64String.split(';')[0].split(':')[1];
    if (!['image/jpeg', 'image/jpg', 'image/png'].includes(mimeType)) return false;
    if (base64String.length < 1000) return false;
    return true;
}

const APP_VERSION = "2.0.0";
const AUTHOR = "Michael Steve Pérez Guandique";

const printBanner = () => {
    console.log(`
=========================================================================================================

                ██╗   ██╗██╗   ██╗██╗  ████████╗██╗██████╗     █████╗  ██╗ ██████╗ ███████╗
                ██║   ██║██║   ██║██║  ╚══██╔══╝██║██╔══██╗██╗██╔══██╗███║██╔═████╗██╔════╝
                ██║   ██║██║   ██║██║     ██║   ██║██║  ██║╚═╝╚█████╔╝╚██║██║██╔██║███████╗
                ╚██╗ ██╔╝██║   ██║██║     ██║   ██║██║  ██║██╗██╔══██╗ ██║████╔╝██║╚════██║
                 ╚████╔╝ ╚██████╔╝███████╗██║   ██║██████╔╝╚═╝╚█████╔╝ ██║╚██████╔╝███████║
                  ╚═══╝   ╚═════╝ ╚══════╝╚═╝   ╚═╝╚═════╝     ╚════╝  ╚═╝ ╚═════╝ ╚══════╝
                                                                                                                                                                                    
---------------------------------------------------------------------------------------------------------
 PROYECTO: VULT ID  |  VERSIÓN: ${APP_VERSION}
 PUERTO: ${PORT}  |  ESTADO: ${process.env.NODE_ENV === 'production' ? 'PRODUCCIÓN' : 'DESARROLLO'}
 AUTOR: ${AUTHOR}
 BASE DE DATOS: PostgreSQL
=========================================================================
    `);
};

async function startServer() {
    const dbConnected = await db.testConnection();
    if (!dbConnected) {
        log('WARN', 'Base de datos no disponible. La configuración de BD no funcionará.');
    }

    await loadModels();

    const server = process.env.NODE_ENV === 'production'
        ? https.createServer({ key: fs.readFileSync(process.env.KEY_PATH), cert: fs.readFileSync(process.env.CERT_PATH) }, app)
        : http.createServer(app);

    server.listen(PORT, '0.0.0.0', () => {
        printBanner();
        log('INFO', `Servidor VULT ID escuchando en puerto ${PORT}`);
    });
}

startServer().catch(err => {
    log('ERROR', 'Error fatal al iniciar servidor', { error: err.message });
    process.exit(1);
});

module.exports = app;

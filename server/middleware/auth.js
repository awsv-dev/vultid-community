const jwt = require('jsonwebtoken');
const queries = require('../db/queries');

const JWT_SECRET = process.env.JWT_SECRET || 'vultid-dev-secret-change-in-production';

function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Token de acceso requerido.' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ success: false, error: 'Token expirado.', expired: true });
        }
        return res.status(401).json({ success: false, error: 'Token inválido.' });
    }
}

function adminAuthMiddleware(req, res, next) {
    const adminUser = process.env.ADMIN_USER;
    const adminPass = process.env.ADMIN_PASS;

    if (!adminUser || !adminPass) {
        return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Basic ')) {
        res.setHeader('WWW-Authenticate', 'Basic realm="VULT ID Admin"');
        return res.status(401).json({ success: false, error: 'Autenticación requerida.' });
    }

    const decoded = Buffer.from(authHeader.split(' ')[1], 'base64').toString();
    const [username, password] = decoded.split(':');

    if (username === adminUser && password === adminPass) {
        return next();
    }

    res.setHeader('WWW-Authenticate', 'Basic realm="VULT ID Admin"');
    return res.status(401).json({ success: false, error: 'Credenciales inválidas.' });
}

module.exports = { authMiddleware, adminAuthMiddleware, JWT_SECRET };

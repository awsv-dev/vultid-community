const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const queries = require('../db/queries');
const { authMiddleware, JWT_SECRET } = require('../middleware/auth');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../services/email');
const { createLicenseForUser } = require('../services/license');

const router = express.Router();

const BCRYPT_ROUNDS = 12;
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY_DAYS = 7;

function generateAccessToken(user) {
    return jwt.sign(
        { id: user.id, email: user.email, name: user.name },
        JWT_SECRET,
        { expiresIn: ACCESS_TOKEN_EXPIRY }
    );
}

function generateRefreshToken() {
    return crypto.randomBytes(40).toString('hex');
}

function setRefreshTokenCookie(res, token) {
    res.cookie('refreshToken', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
        path: '/'
    });
}

router.post('/register', async (req, res) => {
    try {
        const { email, password, name } = req.body;

        if (!email || !password || !name) {
            return res.status(400).json({ success: false, error: 'Email, contraseña y nombre son requeridos.' });
        }

        if (password.length < 8) {
            return res.status(400).json({ success: false, error: 'La contraseña debe tener al menos 8 caracteres.' });
        }

        const existing = await queries.findUserByEmail(email);
        if (existing) {
            return res.status(409).json({ success: false, error: 'Ya existe una cuenta con este email.' });
        }

        const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
        const verificationToken = crypto.randomBytes(32).toString('hex');

        const user = await queries.createUser({
            email,
            password_hash: passwordHash,
            name,
            provider: 'local',
            email_verified: false,
            verification_token: verificationToken
        });

        await sendVerificationEmail(email, name, verificationToken);

        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);
        await queries.createRefreshToken(user.id, refreshToken, expiresAt);

        setRefreshTokenCookie(res, refreshToken);

        res.status(201).json({
            success: true,
            user: { id: user.id, email: user.email, name: user.name, email_verified: user.email_verified },
            accessToken
        });
    } catch (error) {
        console.error('[AUTH] Register error:', error.message);
        res.status(500).json({ success: false, error: 'Error al crear cuenta.' });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Email y contraseña son requeridos.' });
        }

        const user = await queries.findUserByEmail(email);
        if (!user) {
            return res.status(401).json({ success: false, error: 'Credenciales inválidas.' });
        }

        if (user.provider !== 'local') {
            return res.status(401).json({ success: false, error: 'Esta cuenta usa login social. Usa Google o GitHub para iniciar sesión.' });
        }

        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) {
            return res.status(401).json({ success: false, error: 'Credenciales inválidas.' });
        }

        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);
        await queries.createRefreshToken(user.id, refreshToken, expiresAt);

        setRefreshTokenCookie(res, refreshToken);

        res.json({
            success: true,
            user: { id: user.id, email: user.email, name: user.name, email_verified: user.email_verified },
            accessToken
        });
    } catch (error) {
        console.error('[AUTH] Login error:', error.message);
        res.status(500).json({ success: false, error: 'Error al iniciar sesión.' });
    }
});

router.post('/refresh', async (req, res) => {
    try {
        const refreshToken = req.cookies?.refreshToken;
        if (!refreshToken) {
            return res.status(401).json({ success: false, error: 'Refresh token requerido.' });
        }

        const tokenData = await queries.findRefreshToken(refreshToken);
        if (!tokenData) {
            return res.status(401).json({ success: false, error: 'Refresh token inválido o expirado.' });
        }

        const user = await queries.findUserById(tokenData.user_id);
        if (!user) {
            return res.status(401).json({ success: false, error: 'Usuario no encontrado.' });
        }

        await queries.deleteRefreshToken(refreshToken);

        const accessToken = generateAccessToken(user);
        const newRefreshToken = generateRefreshToken();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);
        await queries.createRefreshToken(user.id, newRefreshToken, expiresAt);

        setRefreshTokenCookie(res, newRefreshToken);

        res.json({ success: true, accessToken });
    } catch (error) {
        console.error('[AUTH] Refresh error:', error.message);
        res.status(500).json({ success: false, error: 'Error al renovar token.' });
    }
});

router.post('/logout', authMiddleware, async (req, res) => {
    try {
        const refreshToken = req.cookies?.refreshToken;
        if (refreshToken) {
            await queries.deleteRefreshToken(refreshToken);
        }
        res.clearCookie('refreshToken');
        res.json({ success: true, message: 'Sesión cerrada.' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error al cerrar sesión.' });
    }
});

router.get('/me', authMiddleware, async (req, res) => {
    try {
        const user = await queries.findUserById(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'Usuario no encontrado.' });
        }

        const subscription = await queries.findActiveSubscription(user.id);
        const licenses = await queries.findLicensesByUser(user.id);

        res.json({
            success: true,
            user: {
                id: user.id, email: user.email, name: user.name,
                avatar_url: user.avatar_url, provider: user.provider,
                email_verified: user.email_verified, created_at: user.created_at
            },
            subscription,
            licenses
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error al obtener perfil.' });
    }
});

router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ success: false, error: 'Email requerido.' });
        }

        const user = await queries.findUserByEmail(email);
        if (user) {
            const resetToken = crypto.randomBytes(32).toString('hex');
            const expiresAt = new Date();
            expiresAt.setHours(expiresAt.getHours() + 1);
            await queries.updateUser(user.id, { reset_token: resetToken, reset_token_expires: expiresAt });
            await sendPasswordResetEmail(user.email, user.name, resetToken);
        }

        res.json({ success: true, message: 'Si el email existe, recibirás un enlace de restablecimiento.' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error al procesar solicitud.' });
    }
});

router.post('/reset-password', async (req, res) => {
    try {
        const { token, password } = req.body;
        if (!token || !password) {
            return res.status(400).json({ success: false, error: 'Token y contraseña requeridos.' });
        }

        if (password.length < 8) {
            return res.status(400).json({ success: false, error: 'La contraseña debe tener al menos 8 caracteres.' });
        }

        const result = await queries.query(
            'SELECT * FROM users WHERE reset_token = $1 AND reset_token_expires > NOW()',
            [token]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ success: false, error: 'Token inválido o expirado.' });
        }

        const user = result.rows[0];
        const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
        await queries.updateUser(user.id, { password_hash: passwordHash, reset_token: null, reset_token_expires: null });

        res.json({ success: true, message: 'Contraseña actualizada exitosamente.' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error al restablecer contraseña.' });
    }
});

router.get('/verify-email', async (req, res) => {
    try {
        const { token } = req.query;
        if (!token) {
            return res.status(400).json({ success: false, error: 'Token requerido.' });
        }

        const result = await queries.query(
            'SELECT * FROM users WHERE verification_token = $1',
            [token]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ success: false, error: 'Token inválido.' });
        }

        await queries.updateUser(result.rows[0].id, { email_verified: true, verification_token: null });

        res.json({ success: true, message: 'Email verificado exitosamente.' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error al verificar email.' });
    }
});

module.exports = router;

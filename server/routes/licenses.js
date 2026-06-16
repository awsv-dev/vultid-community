const express = require('express');
const queries = require('../db/queries');
const { authMiddleware } = require('../middleware/auth');
const { validateLicense, createLicenseForUser } = require('../services/license');

const router = express.Router();

router.get('/me', authMiddleware, async (req, res) => {
    try {
        const licenses = await queries.findLicensesByUser(req.user.id);
        res.json({ success: true, data: licenses });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error al obtener licencias.' });
    }
});

router.get('/validate/:key', async (req, res) => {
    try {
        const result = await validateLicense(req.params.key);
        if (!result.valid) {
            return res.status(400).json({ success: false, ...result });
        }
        res.json({ success: true, ...result });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error al validar licencia.' });
    }
});

router.post('/regenerate', authMiddleware, async (req, res) => {
    try {
        const subscription = await queries.findActiveSubscription(req.user.id);
        if (!subscription) {
            return res.status(404).json({ success: false, error: 'No hay suscripción activa.' });
        }

        await queries.deactivateLicensesByUser(req.user.id);

        const license = await createLicenseForUser(
            req.user.id,
            subscription.id,
            subscription.plan_slug
        );

        res.json({ success: true, data: license });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error al regenerar licencia.' });
    }
});

module.exports = router;

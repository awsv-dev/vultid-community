const express = require('express');
const queries = require('../db/queries');
const { verifyWebhookSignature } = require('../services/wompi');
const { createLicenseForUser } = require('../services/license');
const { sendPaymentConfirmation } = require('../services/email');

const router = express.Router();

router.post('/webhook', async (req, res) => {
    try {
        const payload = req.body;

        console.log('[WOMPI WEBHOOK] Received:', JSON.stringify(payload, null, 2));

        if (!payload.IdTransaccion || !payload.ResultadoTransaccion) {
            return res.status(400).json({ success: false, error: 'Invalid webhook payload' });
        }

        if (payload.ResultadoTransaccion !== 'ExitosaAprobada') {
            console.log('[WOMPI WEBHOOK] Transaction not approved:', payload.ResultadoTransaccion);
            return res.json({ success: true, status: 'ignored', reason: payload.ResultadoTransaccion });
        }

        const identifier = payload.EnlacePago?.IdentificadorEnlaceComercio || '';
        const match = identifier.match(/^VULTID-([a-f0-9-]+)-(\d+)$/);

        if (!match) {
            console.log('[WOMPI WEBHOOK] Non-VULTID transaction:', identifier);
            return res.json({ success: true, status: 'ignored' });
        }

        const userId = match[1];

        const existing = await queries.query(
            "SELECT * FROM payments WHERE wompi_transaction_id = $1",
            [payload.IdTransaccion]
        );

        if (existing.rows.length > 0) {
            console.log('[WOMPI WEBHOOK] Duplicate transaction:', payload.IdTransaccion);
            return res.json({ success: true, status: 'already_processed' });
        }

        const user = await queries.findUserById(userId);
        if (!user) {
            console.log('[WOMPI WEBHOOK] User not found:', userId);
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const subscription = await queries.findActiveSubscription(userId);
        if (!subscription) {
            console.log('[WOMPI WEBHOOK] No active subscription for user:', userId);
            return res.status(404).json({ success: false, error: 'No subscription found' });
        }

        await queries.updateSubscription(subscription.id, { status: 'active' });

        await queries.createPayment({
            user_id: userId,
            subscription_id: subscription.id,
            wompi_transaction_id: payload.IdTransaccion,
            amount: payload.Monto,
            status: 'approved',
            payment_method: payload.FormaPagoUtilizada || 'card'
        });

        const license = await createLicenseForUser(userId, subscription.id, subscription.plan_slug);

        await sendPaymentConfirmation(user.email, user.name, subscription.plan_name, license.license_key);

        console.log('[WOMPI WEBHOOK] Payment processed for user:', userId, 'license:', license.license_key);

        res.json({ success: true, status: 'processed' });
    } catch (error) {
        console.error('[WOMPI WEBHOOK] Error:', error.message);
        res.status(500).json({ success: false, error: 'Webhook processing error' });
    }
});

module.exports = router;

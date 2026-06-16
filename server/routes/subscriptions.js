const express = require('express');
const crypto = require('crypto');
const queries = require('../db/queries');
const { authMiddleware } = require('../middleware/auth');
const { createPaymentLink, createRecurringLink } = require('../services/wompi');
const { createLicenseForUser } = require('../services/license');

const router = express.Router();

router.get('/plans', async (req, res) => {
    try {
        const plans = await queries.listPlans();
        res.json({ success: true, data: plans });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error al obtener planes.' });
    }
});

router.get('/me', authMiddleware, async (req, res) => {
    try {
        const subscription = await queries.findActiveSubscription(req.user.id);
        const licenses = await queries.findLicensesByUser(req.user.id);
        const payments = await queries.findPaymentsByUser(req.user.id);

        res.json({ success: true, subscription, licenses, payments });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error al obtener suscripción.' });
    }
});

router.post('/create', authMiddleware, async (req, res) => {
    try {
        const { plan_slug, billing_cycle } = req.body;

        if (!plan_slug || !billing_cycle) {
            return res.status(400).json({ success: false, error: 'plan_slug y billing_cycle requeridos.' });
        }

        if (!['monthly', 'annual'].includes(billing_cycle)) {
            return res.status(400).json({ success: false, error: 'billing_cycle debe ser monthly o annual.' });
        }

        const plan = await queries.findPlanBySlug(plan_slug);
        if (!plan) {
            return res.status(404).json({ success: false, error: 'Plan no encontrado.' });
        }

        const existing = await queries.findActiveSubscription(req.user.id);
        if (existing && existing.status === 'active') {
            return res.status(409).json({ success: false, error: 'Ya tienes una suscripción activa.' });
        }

        const amount = billing_cycle === 'monthly' ? plan.price_monthly : plan.price_annual;
        const identifier = `VULTID-${req.user.id}-${Date.now()}`;

        let paymentLinkResult;
        try {
            paymentLinkResult = await createPaymentLink({
                identifier,
                amount: parseFloat(amount),
                productName: `VULT ID - ${plan.name} (${billing_cycle === 'monthly' ? 'Mensual' : 'Anual'})`,
                description: `${plan.description} - ${billing_cycle === 'monthly' ? 'Pago mensual' : 'Pago anual con 2 meses gratis'}`,
                redirectUrl: `${process.env.APP_URL || 'http://localhost:3000'}/dashboard?payment=success`,
                webhookUrl: `${process.env.APP_URL || 'http://localhost:3000'}/api/wompi/webhook`
            });
        } catch (wompiError) {
            console.error('[SUBSCRIPTIONS] Wompi error:', wompiError.message);
            paymentLinkResult = {
                urlEnlace: `${process.env.APP_URL || 'http://localhost:3000'}/dashboard?payment=success&mock=true`,
                idEnlace: `mock-${Date.now()}`
            };
        }

        const trialEndsAt = new Date();
        trialEndsAt.setDate(trialEndsAt.getDate() + 30);

        const periodEnd = new Date();
        if (billing_cycle === 'monthly') {
            periodEnd.setMonth(periodEnd.getMonth() + 1);
        } else {
            periodEnd.setFullYear(periodEnd.getFullYear() + 1);
        }

        const subscription = await queries.createSubscription({
            user_id: req.user.id,
            plan_id: plan.id,
            wompi_enlace_id: String(paymentLinkResult.idEnlace),
            status: 'trial',
            trial_ends_at: trialEndsAt,
            current_period_start: new Date(),
            current_period_end: periodEnd
        });

        await queries.createPayment({
            user_id: req.user.id,
            subscription_id: subscription.id,
            wompi_transaction_id: `pending-${Date.now()}`,
            amount: parseFloat(amount),
            status: 'pending',
            payment_method: 'wompi'
        });

        res.status(201).json({
            success: true,
            subscription,
            payment_url: paymentLinkResult.urlEnlace,
            message: 'Suscripción creada. Redirigiendo a pago...'
        });
    } catch (error) {
        console.error('[SUBSCRIPTIONS] Create error:', error.message);
        res.status(500).json({ success: false, error: 'Error al crear suscripción.' });
    }
});

router.post('/cancel', authMiddleware, async (req, res) => {
    try {
        const subscription = await queries.findActiveSubscription(req.user.id);
        if (!subscription) {
            return res.status(404).json({ success: false, error: 'No se encontró suscripción activa.' });
        }

        await queries.updateSubscription(subscription.id, { cancel_at_period_end: true });

        res.json({ success: true, message: 'Suscripción se cancelará al final del período actual.' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error al cancelar suscripción.' });
    }
});

module.exports = router;

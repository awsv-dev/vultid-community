const crypto = require('crypto');
const queries = require('../db/queries');

function generateLicenseKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const segments = [5, 5, 5, 5];
    let key = 'VULTID';
    for (const len of segments) {
        key += '-';
        let segment = '';
        for (let i = 0; i < len; i++) {
            segment += chars.charAt(crypto.randomInt(chars.length));
        }
        key += segment;
    }
    return key;
}

async function createLicenseForUser(userId, subscriptionId, planSlug) {
    const days = planSlug === 'combo-enterprise' ? 30 : 30;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + days);

    const subscriberId = crypto.randomUUID();
    await queries.createSuscriptor({
        faceapp_id: subscriberId,
        faceapp_tipo: planSlug === 'combo-enterprise' ? 1 : 0,
        faceapp_liveness_type: 'smile',
        faceapp_show_landmarks: true,
        faceapp_show_expressions: true,
        faceapp_es_demo: false
    });

    const licenseKey = generateLicenseKey();
    const license = await queries.createLicense({
        user_id: userId,
        subscription_id: subscriptionId,
        license_key: licenseKey,
        subscriber_uuid: subscriberId,
        expires_at: expiresAt,
        max_devices: planSlug === 'combo-enterprise' ? 3 : 1
    });

    return license;
}

async function validateLicense(licenseKey) {
    const license = await queries.findLicenseByKey(licenseKey);
    if (!license) {
        return { valid: false, error: 'Licencia no encontrada.' };
    }

    if (!license.is_active) {
        return { valid: false, error: 'Licencia desactivada.' };
    }

    const now = new Date();
    if (new Date(license.expires_at) < now) {
        return { valid: false, error: 'Licencia expirada.', expires_at: license.expires_at };
    }

    const daysRemaining = Math.ceil((new Date(license.expires_at) - now) / (1000 * 60 * 60 * 24));

    return {
        valid: true,
        subscriber_uuid: license.subscriber_uuid,
        config: {
            liveness_type: license.faceapp_liveness_type || 'smile',
            show_landmarks: license.faceapp_show_landmarks !== false,
            show_expressions: license.faceapp_show_expressions !== false
        },
        expires_at: license.expires_at,
        days_remaining: daysRemaining
    };
}

module.exports = { generateLicenseKey, createLicenseForUser, validateLicense };

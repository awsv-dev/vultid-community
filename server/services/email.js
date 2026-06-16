const fetch = require('node-fetch');

const ZOHO_API_URL = process.env.ZOHO_API_URL || 'https://mail.zoho.com/api/accounts';
const ZOHO_API_KEY = process.env.ZOHO_API_KEY;
const ZOHO_FROM_EMAIL = process.env.ZOHO_FROM_EMAIL;
const ZOHO_FROM_NAME = process.env.ZOHO_FROM_NAME || 'VULT ID';

async function sendEmail(to, subject, htmlBody) {
    if (!ZOHO_API_KEY) {
        console.log(`[EMAIL] (DEV) To: ${to}, Subject: ${subject}`);
        return { success: true, dev: true };
    }

    try {
        const response = await fetch(ZOHO_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Zoho-oauthtoken ${ZOHO_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                fromAddress: ZOHO_FROM_EMAIL,
                toAddress: to,
                subject: subject,
                content: htmlBody,
                mailFormat: 'html'
            })
        });

        if (!response.ok) {
            const error = await response.text();
            console.error('[EMAIL] Error:', error);
            return { success: false, error };
        }

        return { success: true };
    } catch (error) {
        console.error('[EMAIL] Error sending:', error.message);
        return { success: false, error: error.message };
    }
}

async function sendVerificationEmail(to, name, token) {
    const verifyUrl = `${process.env.APP_URL || 'http://localhost:3000'}/verify-email?token=${token}`;
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #21436d;">Bienvenido a VULT ID</h2>
            <p>Hola ${name},</p>
            <p>Tu cuenta ha sido creada exitosamente. Para activarla, haz clic en el siguiente enlace:</p>
            <a href="${verifyUrl}" style="display: inline-block; background: #21436d; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 16px 0;">Verificar Email</a>
            <p style="color: #666; font-size: 12px;">Si no creaste esta cuenta, puedes ignorar este mensaje.</p>
        </div>
    `;
    return sendEmail(to, 'VULT ID - Verifica tu email', html);
}

async function sendPasswordResetEmail(to, name, token) {
    const resetUrl = `${process.env.APP_URL || 'http://localhost:3000'}/reset-password?token=${token}`;
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #21436d;">Restablecer Contraseña</h2>
            <p>Hola ${name},</p>
            <p>Recibimos una solicitud para restablecer tu contraseña. Haz clic en el siguiente enlace:</p>
            <a href="${resetUrl}" style="display: inline-block; background: #21436d; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 16px 0;">Restablecer Contraseña</a>
            <p style="color: #666; font-size: 12px;">Este enlace expira en 1 hora. Si no solicitaste esto, ignora este mensaje.</p>
        </div>
    `;
    return sendEmail(to, 'VULT ID - Restablecer Contraseña', html);
}

async function sendPaymentConfirmation(to, name, planName, licenseKey) {
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #21436d;">Pago Confirmado</h2>
            <p>Hola ${name},</p>
            <p>Tu pago ha sido procesado exitosamente.</p>
            <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
                <p><strong>Plan:</strong> ${planName}</p>
                <p><strong>Licencia:</strong> <code>${licenseKey}</code></p>
            </div>
            <p>Usa esta licencia para activar VULT ID en tu aplicación.</p>
        </div>
    `;
    return sendEmail(to, 'VULT ID - Pago Confirmado', html);
}

module.exports = { sendEmail, sendVerificationEmail, sendPasswordResetEmail, sendPaymentConfirmation };

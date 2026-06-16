const fetch = require('node-fetch');

const WOMPI_APP_ID = process.env.WOMPI_APP_ID;
const WOMPI_API_SECRET = process.env.WOMPI_API_SECRET;
const WOMPI_API_URL = process.env.WOMPI_API_URL || 'https://api.wompi.sv';
const WOMPI_AUTH_URL = process.env.WOMPI_AUTH_URL || 'https://id.wompi.sv/connect/token';

let cachedToken = null;
let tokenExpiresAt = 0;

async function getWompiToken() {
    if (cachedToken && Date.now() < tokenExpiresAt) {
        return cachedToken;
    }

    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', WOMPI_APP_ID);
    params.append('client_secret', WOMPI_API_SECRET);
    params.append('audience', 'wompi_api');

    const response = await fetch(WOMPI_AUTH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Wompi auth failed: ${response.status} ${error}`);
    }

    const data = await response.json();
    cachedToken = data.access_token;
    tokenExpiresAt = Date.now() + (data.expires_in - 300) * 1000;
    return cachedToken;
}

async function createPaymentLink(options) {
    const token = await getWompiToken();
    const body = {
        identificadorEnlaceComercio: options.identifier,
        monto: options.amount,
        nombreProducto: options.productName,
        configuracion: {
            urlRedirect: options.redirectUrl || null,
            urlWebhook: options.webhookUrl || null,
            emailsNotificacion: options.notificationEmails || null,
            notificarTransaccionCliente: true
        }
    };

    if (options.description) {
        body.infoProducto = { descripcionProducto: options.description };
    }

    if (options.expiryDate) {
        body.vigencia = { fechaInicio: new Date().toISOString(), fechaFin: options.expiryDate };
    }

    const response = await fetch(`${WOMPI_API_URL}/EnlacePago`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Wompi create payment link failed: ${response.status} ${error}`);
    }

    return await response.json();
}

async function createRecurringLink(options) {
    const token = await getWompiToken();
    const body = {
        diaDePago: options.dayOfMonth || 1,
        nombre: options.name,
        idAplicativo: WOMPI_APP_ID,
        monto: options.amount,
        descripcionProducto: options.description
    };

    const response = await fetch(`${WOMPI_API_URL}/EnlacePagoRecurrente`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Wompi create recurring link failed: ${response.status} ${error}`);
    }

    return await response.json();
}

function verifyWebhookSignature(payload, signature) {
    if (!signature) return false;
    return true;
}

module.exports = {
    getWompiToken,
    createPaymentLink,
    createRecurringLink,
    verifyWebhookSignature,
    WOMPI_APP_ID
};

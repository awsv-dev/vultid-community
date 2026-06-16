const { query } = require('./connection');

// ========================================
// SUSCRIPTORES (existente)
// ========================================

async function findSuscriptorByUUID(uuid) {
    const result = await query(
        `SELECT 
            faceapp_id,
            faceapp_url_api,
            faceapp_url_redirect,
            faceapp_tipo,
            faceapp_token_api,
            faceapp_auth_method,
            faceapp_auth_username,
            faceapp_origin_allowed,
            faceapp_match_threshold,
            faceapp_liveness_type,
            faceapp_show_landmarks,
            faceapp_show_expressions,
            faceapp_es_demo
         FROM suscriptores 
         WHERE faceapp_id = $1 AND activo = true`,
        [uuid]
    );
    return result.rows[0] || null;
}

async function listSuscriptores() {
    const result = await query(
        `SELECT 
            id, faceapp_id, faceapp_url_api, faceapp_url_redirect,
            faceapp_tipo, faceapp_auth_method, faceapp_origin_allowed,
            faceapp_liveness_type, faceapp_show_landmarks, faceapp_show_expressions,
            faceapp_es_demo, activo, created_at, updated_at
         FROM suscriptores 
         ORDER BY created_at DESC`
    );
    return result.rows;
}

async function createSuscriptor(data) {
    const result = await query(
        `INSERT INTO suscriptores (
            faceapp_id, faceapp_url_api, faceapp_url_redirect,
            faceapp_tipo, faceapp_token_api, faceapp_auth_method,
            faceapp_auth_username, faceapp_origin_allowed,
            faceapp_match_threshold, faceapp_liveness_type, faceapp_show_landmarks, faceapp_show_expressions, faceapp_es_demo
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *`,
        [
            data.faceapp_id, data.faceapp_url_api, data.faceapp_url_redirect,
            data.faceapp_tipo || 0, data.faceapp_token_api, data.faceapp_auth_method || 'bearer',
            data.faceapp_auth_username, data.faceapp_origin_allowed || '*',
            data.faceapp_match_threshold || 0.6, data.faceapp_liveness_type || 'smile',
            data.faceapp_show_landmarks !== false, data.faceapp_show_expressions !== false,
            data.faceapp_es_demo || false
        ]
    );
    return result.rows[0];
}

async function updateSuscriptor(uuid, data) {
    const fields = [];
    const values = [];
    let paramIndex = 1;
    const allowedFields = [
        'faceapp_url_api', 'faceapp_url_redirect', 'faceapp_tipo',
        'faceapp_token_api', 'faceapp_auth_method', 'faceapp_auth_username',
        'faceapp_origin_allowed', 'faceapp_match_threshold', 'faceapp_liveness_type',
        'faceapp_show_landmarks', 'faceapp_show_expressions', 'faceapp_es_demo', 'activo'
    ];
    for (const field of allowedFields) {
        if (data[field] !== undefined) {
            fields.push(`${field} = $${paramIndex}`);
            values.push(data[field]);
            paramIndex++;
        }
    }
    if (fields.length === 0) return null;
    values.push(uuid);
    const result = await query(
        `UPDATE suscriptores SET ${fields.join(', ')} WHERE faceapp_id = $${paramIndex} RETURNING *`,
        values
    );
    return result.rows[0] || null;
}

async function deleteSuscriptor(uuid) {
    const result = await query(
        `UPDATE suscriptores SET activo = false WHERE faceapp_id = $1 RETURNING faceapp_id`,
        [uuid]
    );
    return result.rows[0] || null;
}

async function logTransaccion(suscriptorId, data) {
    const result = await query(
        `INSERT INTO transacciones (
            suscriptor_id, tipo_operacion, exitoso,
            distancia_facial, ip_address, user_agent, payload_metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id`,
        [
            suscriptorId, data.tipo_operacion, data.exitoso,
            data.distancia_facial, data.ip_address, data.user_agent,
            data.payload_metadata ? JSON.stringify(data.payload_metadata) : null
        ]
    );
    return result.rows[0];
}

async function getStats(suscriptorId, days = 30) {
    const result = await query(
        `SELECT 
            tipo_operacion,
            COUNT(*) as total,
            SUM(CASE WHEN exitoso THEN 1 ELSE 0 END) as exitosas,
            ROUND(AVG(distancia_facial)::numeric, 4) as distancia_promedio
         FROM transacciones 
         WHERE suscriptor_id = $1 
           AND created_at >= NOW() - INTERVAL '${days} days'
         GROUP BY tipo_operacion`,
        [suscriptorId]
    );
    return result.rows;
}

// ========================================
// USERS
// ========================================

async function findUserByEmail(email) {
    const result = await query('SELECT * FROM users WHERE email = $1', [email]);
    return result.rows[0] || null;
}

async function findUserById(id) {
    const result = await query('SELECT * FROM users WHERE id = $1', [id]);
    return result.rows[0] || null;
}

async function findUserByProvider(provider, providerId) {
    const result = await query(
        'SELECT * FROM users WHERE provider = $1 AND provider_id = $2',
        [provider, providerId]
    );
    return result.rows[0] || null;
}

async function createUser(data) {
    const result = await query(
        `INSERT INTO users (email, password_hash, name, provider, provider_id, email_verified, verification_token)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, email, name, provider, email_verified, created_at`,
        [
            data.email, data.password_hash || null, data.name,
            data.provider || 'local', data.provider_id || null,
            data.email_verified || false, data.verification_token || null
        ]
    );
    return result.rows[0];
}

async function updateUser(id, data) {
    const fields = [];
    const values = [];
    let paramIndex = 1;
    const allowedFields = ['name', 'email', 'avatar_url', 'password_hash', 'email_verified', 'verification_token', 'reset_token', 'reset_token_expires'];
    for (const field of allowedFields) {
        if (data[field] !== undefined) {
            fields.push(`${field} = $${paramIndex}`);
            values.push(data[field]);
            paramIndex++;
        }
    }
    if (fields.length === 0) return null;
    values.push(id);
    const result = await query(
        `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING id, email, name, provider, email_verified, created_at`,
        values
    );
    return result.rows[0] || null;
}

// ========================================
// PLANS
// ========================================

async function listPlans() {
    const result = await query('SELECT * FROM plans WHERE is_active = true ORDER BY price_monthly ASC');
    return result.rows;
}

async function findPlanBySlug(slug) {
    const result = await query('SELECT * FROM plans WHERE slug = $1 AND is_active = true', [slug]);
    return result.rows[0] || null;
}

async function findPlanById(id) {
    const result = await query('SELECT * FROM plans WHERE id = $1', [id]);
    return result.rows[0] || null;
}

// ========================================
// SUBSCRIPTIONS
// ========================================

async function findActiveSubscription(userId) {
    const result = await query(
        `SELECT s.*, p.name as plan_name, p.slug as plan_slug, p.features
         FROM subscriptions s
         JOIN plans p ON s.plan_id = p.id
         WHERE s.user_id = $1 AND s.status IN ('trial', 'active')
         ORDER BY s.created_at DESC LIMIT 1`,
        [userId]
    );
    return result.rows[0] || null;
}

async function createSubscription(data) {
    const result = await query(
        `INSERT INTO subscriptions (user_id, plan_id, wompi_enlace_id, status, trial_ends_at, current_period_start, current_period_end)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
            data.user_id, data.plan_id, data.wompi_enlace_id || null,
            data.status || 'trial', data.trial_ends_at,
            data.current_period_start || new Date(),
            data.current_period_end
        ]
    );
    return result.rows[0];
}

async function updateSubscription(id, data) {
    const fields = [];
    const values = [];
    let paramIndex = 1;
    const allowedFields = ['status', 'wompi_enlace_id', 'cancel_at_period_end', 'current_period_end'];
    for (const field of allowedFields) {
        if (data[field] !== undefined) {
            fields.push(`${field} = $${paramIndex}`);
            values.push(data[field]);
            paramIndex++;
        }
    }
    if (fields.length === 0) return null;
    values.push(id);
    const result = await query(
        `UPDATE subscriptions SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
        values
    );
    return result.rows[0] || null;
}

// ========================================
// LICENSES
// ========================================

async function findLicenseByKey(licenseKey) {
    const result = await query(
        `SELECT l.*, s.faceapp_liveness_type, s.faceapp_show_landmarks, s.faceapp_show_expressions
         FROM licenses l
         LEFT JOIN suscriptores s ON l.subscriber_uuid = s.faceapp_id
         WHERE l.license_key = $1 AND l.is_active = true`,
        [licenseKey]
    );
    return result.rows[0] || null;
}

async function findLicensesByUser(userId) {
    const result = await query(
        `SELECT l.*, p.name as plan_name
         FROM licenses l
         LEFT JOIN subscriptions sub ON l.subscription_id = sub.id
         LEFT JOIN plans p ON sub.plan_id = p.id
         WHERE l.user_id = $1
         ORDER BY l.created_at DESC`,
        [userId]
    );
    return result.rows;
}

async function createLicense(data) {
    const result = await query(
        `INSERT INTO licenses (user_id, subscription_id, license_key, subscriber_uuid, expires_at, max_devices)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
            data.user_id, data.subscription_id, data.license_key,
            data.subscriber_uuid, data.expires_at, data.max_devices || 1
        ]
    );
    return result.rows[0];
}

async function deactivateLicensesByUser(userId) {
    await query('UPDATE licenses SET is_active = false WHERE user_id = $1', [userId]);
}

// ========================================
// PAYMENTS
// ========================================

async function createPayment(data) {
    const result = await query(
        `INSERT INTO payments (user_id, subscription_id, wompi_transaction_id, amount, currency, status, payment_method)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
            data.user_id, data.subscription_id, data.wompi_transaction_id,
            data.amount, data.currency || 'USD', data.status || 'pending',
            data.payment_method || null
        ]
    );
    return result.rows[0];
}

async function findPaymentsByUser(userId) {
    const result = await query(
        'SELECT * FROM payments WHERE user_id = $1 ORDER BY created_at DESC',
        [userId]
    );
    return result.rows;
}

async function updatePaymentStatus(wompiTransactionId, status) {
    const result = await query(
        'UPDATE payments SET status = $1 WHERE wompi_transaction_id = $2 RETURNING *',
        [status, wompiTransactionId]
    );
    return result.rows[0] || null;
}

// ========================================
// REFRESH TOKENS
// ========================================

async function createRefreshToken(userId, token, expiresAt) {
    const result = await query(
        'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3) RETURNING *',
        [userId, token, expiresAt]
    );
    return result.rows[0];
}

async function findRefreshToken(token) {
    const result = await query(
        'SELECT * FROM refresh_tokens WHERE token = $1 AND expires_at > NOW()',
        [token]
    );
    return result.rows[0] || null;
}

async function deleteRefreshToken(token) {
    await query('DELETE FROM refresh_tokens WHERE token = $1', [token]);
}

async function deleteExpiredRefreshTokens() {
    await query('DELETE FROM refresh_tokens WHERE expires_at <= NOW()');
}

module.exports = {
    query,
    findSuscriptorByUUID, listSuscriptores, createSuscriptor, updateSuscriptor, deleteSuscriptor,
    logTransaccion, getStats,
    findUserByEmail, findUserById, findUserByProvider, createUser, updateUser,
    listPlans, findPlanBySlug, findPlanById,
    findActiveSubscription, createSubscription, updateSubscription,
    findLicenseByKey, findLicensesByUser, createLicense, deactivateLicensesByUser,
    createPayment, findPaymentsByUser, updatePaymentStatus,
    createRefreshToken, findRefreshToken, deleteRefreshToken, deleteExpiredRefreshTokens
};

const { query } = require('./connection');

/**
 * Busca un suscriptor por su faceapp_id (UUID)
 */
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

/**
 * Lista todos los suscriptores activos
 */
async function listSuscriptores() {
    const result = await query(
        `SELECT 
            id,
            faceapp_id,
            faceapp_url_api,
            faceapp_url_redirect,
            faceapp_tipo,
            faceapp_auth_method,
            faceapp_origin_allowed,
            faceapp_liveness_type,
            faceapp_show_landmarks,
            faceapp_show_expressions,
            faceapp_es_demo,
            activo,
            created_at,
            updated_at
         FROM suscriptores 
         ORDER BY created_at DESC`
    );
    return result.rows;
}

/**
 * Crea un nuevo suscriptor
 */
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
            data.faceapp_id,
            data.faceapp_url_api,
            data.faceapp_url_redirect,
            data.faceapp_tipo || 0,
            data.faceapp_token_api,
            data.faceapp_auth_method || 'bearer',
            data.faceapp_auth_username,
            data.faceapp_origin_allowed || '*',
            data.faceapp_match_threshold || 0.6,
            data.faceapp_liveness_type || 'smile',
            data.faceapp_show_landmarks !== false,
            data.faceapp_show_expressions !== false,
            data.faceapp_es_demo || false
        ]
    );
    return result.rows[0];
}

/**
 * Actualiza un suscriptor existente
 */
async function updateSuscriptor(uuid, data) {
    const fields = [];
    const values = [];
    let paramIndex = 1;

    const allowedFields = [
        'faceapp_url_api', 'faceapp_url_redirect', 'faceapp_tipo',
        'faceapp_token_api', 'faceapp_auth_method', 'faceapp_auth_username',
        'faceapp_origin_allowed', 'faceapp_match_threshold', 'faceapp_liveness_type', 'faceapp_show_landmarks', 'faceapp_show_expressions', 'faceapp_es_demo', 'activo'
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

/**
 * Elimina un suscriptor (soft delete)
 */
async function deleteSuscriptor(uuid) {
    const result = await query(
        `UPDATE suscriptores SET activo = false WHERE faceapp_id = $1 RETURNING faceapp_id`,
        [uuid]
    );
    return result.rows[0] || null;
}

/**
 * Registra una transacción
 */
async function logTransaccion(suscriptorId, data) {
    const result = await query(
        `INSERT INTO transacciones (
            suscriptor_id, tipo_operacion, exitoso,
            distancia_facial, ip_address, user_agent, payload_metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id`,
        [
            suscriptorId,
            data.tipo_operacion,
            data.exitoso,
            data.distancia_facial,
            data.ip_address,
            data.user_agent,
            data.payload_metadata ? JSON.stringify(data.payload_metadata) : null
        ]
    );
    return result.rows[0];
}

/**
 * Obtiene estadísticas de transacciones
 */
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

module.exports = {
    findSuscriptorByUUID,
    listSuscriptores,
    createSuscriptor,
    updateSuscriptor,
    deleteSuscriptor,
    logTransaccion,
    getStats
};

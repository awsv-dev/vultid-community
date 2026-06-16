-- VULT ID Database Schema
-- PostgreSQL 16

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Tabla principal de suscriptores
CREATE TABLE IF NOT EXISTS suscriptores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    faceapp_id UUID UNIQUE NOT NULL,
    faceapp_url_api TEXT,
    faceapp_url_redirect TEXT,
    faceapp_tipo INTEGER DEFAULT 0 CHECK (faceapp_tipo IN (0, 1)),
    faceapp_token_api TEXT,
    faceapp_auth_method VARCHAR(50) DEFAULT 'bearer',
    faceapp_auth_username VARCHAR(100),
    faceapp_origin_allowed TEXT DEFAULT '*',
    faceapp_match_threshold FLOAT DEFAULT 0.6 CHECK (faceapp_match_threshold BETWEEN 0.0 AND 1.0),
    faceapp_liveness_type VARCHAR(30) DEFAULT 'smile' CHECK (faceapp_liveness_type IN ('smile', 'surprise', 'mouth_open', 'head_movement', 'button', 'button:gesture', 'button:head_movement')),
    faceapp_show_landmarks BOOLEAN DEFAULT true,
    faceapp_es_demo BOOLEAN DEFAULT false,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de logs de transacciones
CREATE TABLE IF NOT EXISTS transacciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    suscriptor_id UUID NOT NULL REFERENCES suscriptores(id) ON DELETE CASCADE,
    tipo_operacion VARCHAR(50) NOT NULL,
    exitoso BOOLEAN DEFAULT false,
    distancia_facial FLOAT,
    ip_address INET,
    user_agent TEXT,
    payload_metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de configuración del sistema
CREATE TABLE IF NOT EXISTS sistema_config (
    clave VARCHAR(100) PRIMARY KEY,
    valor TEXT NOT NULL,
    descripcion TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_suscriptores_faceapp_id ON suscriptores(faceapp_id);
CREATE INDEX IF NOT EXISTS idx_transacciones_suscriptor_id ON transacciones(suscriptor_id);
CREATE INDEX IF NOT EXISTS idx_transacciones_created_at ON transacciones(created_at DESC);

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers para updated_at
CREATE TRIGGER update_suscriptores_updated_at
    BEFORE UPDATE ON suscriptores
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Datos iniciales de configuración del sistema
INSERT INTO sistema_config (clave, valor, descripcion) VALUES
    ('api_version', '2.0.0', 'Versión actual de la API'),
    ('cache_ttl_minutes', '60', 'Tiempo de vida del caché en minutos'),
    ('face_match_threshold_default', '0.6', 'Umbral por defecto para coincidencia facial')
ON CONFLICT (clave) DO NOTHING;

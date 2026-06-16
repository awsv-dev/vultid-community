-- Migracion: Unificar trigger_type y liveness_type en un solo campo
-- Ejecutar si ya tienes una base de datos existente

-- Paso 1: Crear columna unificada si no existe
ALTER TABLE suscriptores
ADD COLUMN IF NOT EXISTS faceapp_liveness_type_new VARCHAR(20) DEFAULT 'smile'
CHECK (faceapp_liveness_type_new IN ('smile', 'surprise', 'mouth_open', 'head_movement', 'button'));

-- Paso 2: Migrar datos del schema antiguo al nuevo
-- Si tenia trigger_type, ese valor pasa a liveness_type_new
UPDATE suscriptores
SET faceapp_liveness_type_new = CASE
    WHEN faceapp_trigger_type = 'button' THEN 'button'
    WHEN faceapp_trigger_type = 'smile' THEN 'smile'
    WHEN faceapp_trigger_type = 'surprise' THEN 'surprise'
    WHEN faceapp_trigger_type = 'mouth_open' THEN 'mouth_open'
    ELSE 'smile'
END
WHERE faceapp_liveness_type_new IS NULL OR faceapp_liveness_type_new = 'smile';

-- Paso 3: Eliminar columnas antiguas
ALTER TABLE suscriptores DROP COLUMN IF EXISTS faceapp_trigger_type;
ALTER TABLE suscriptores DROP COLUMN IF EXISTS faceapp_liveness_type;

-- Paso 4: Renombrar la columna nueva
ALTER TABLE suscriptores RENAME COLUMN faceapp_liveness_type_new TO faceapp_liveness_type;

-- Paso 5: Asegurar DEFAULT y NOT NULL
ALTER TABLE suscriptores ALTER COLUMN faceapp_liveness_type SET DEFAULT 'smile';
ALTER TABLE suscriptores ALTER COLUMN faceapp_liveness_type SET NOT NULL;

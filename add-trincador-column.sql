-- =====================================================
-- AÑADIR COLUMNA TRINCADOR A LA TABLA CENSO
-- =====================================================
-- Este script añade la columna 'trincador' a la tabla censo
-- para identificar si una chapa tiene especialidad de trincador

-- 1. Añadir la columna trincador (BOOLEAN)
-- Por defecto FALSE, lo que significa que no es trincador
ALTER TABLE censo
ADD COLUMN IF NOT EXISTS trincador BOOLEAN DEFAULT FALSE;

-- 2. Crear un índice para mejorar las consultas por trincador
CREATE INDEX IF NOT EXISTS idx_censo_trincador ON censo(trincador) WHERE trincador = TRUE;

-- 3. Comentario descriptivo de la columna
COMMENT ON COLUMN censo.trincador IS 'Indica si la chapa tiene especialidad de trincador (T en Google Sheets)';

-- =====================================================
-- VERIFICACIÓN
-- =====================================================
-- Para verificar que la columna se creó correctamente:
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'censo' AND column_name = 'trincador';

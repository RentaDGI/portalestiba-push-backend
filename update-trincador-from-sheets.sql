-- =====================================================
-- ACTUALIZAR TRINCADORES DESDE GOOGLE SHEETS
-- =====================================================
-- Este script actualiza la columna 'trincador' en la tabla censo
-- basándose en los datos importados desde Google Sheets
--
-- PREREQUISITO: Los datos del Google Sheet deben estar en una tabla temporal
-- con las columnas: pos (posicion), chapa, especialidad (T o vacío)
--
-- FORMATO ESPERADO DEL GOOGLE SHEET:
-- pos | chapa | especialidad
-- ----|-------|-------------
-- 1   | 221   | T
-- 2   | 330   |
-- 3   | 190   | T
-- =====================================================

-- OPCIÓN 1: Si tienes los datos en una tabla temporal llamada 'temp_trincadores'
-- =====================================================

-- Primero, resetear todos los trincadores a FALSE
UPDATE censo
SET trincador = FALSE;

-- Actualizar las chapas que SÍ son trincadores basándose en la tabla temporal
UPDATE censo c
SET trincador = TRUE
FROM temp_trincadores t
WHERE c.chapa = t.chapa
  AND TRIM(UPPER(t.especialidad)) = 'T';

-- =====================================================
-- OPCIÓN 2: Actualización directa con lista de chapas
-- =====================================================
-- Si ya sabes qué chapas son trincadores, puedes usar este método:

-- Ejemplo: Actualizar chapas específicas como trincadores
/*
UPDATE censo
SET trincador = TRUE
WHERE chapa IN ('221', '190', '330', '450', '501');
*/

-- =====================================================
-- OPCIÓN 3: Función para importar desde CSV/JSON
-- =====================================================
-- Esta función puede ser llamada desde tu backend para actualizar
-- los trincadores después de leer el Google Sheet

CREATE OR REPLACE FUNCTION actualizar_trincadores_desde_array(
  chapas_trincadores TEXT[]
)
RETURNS INTEGER AS $$
DECLARE
  filas_actualizadas INTEGER;
BEGIN
  -- Resetear todos los trincadores
  UPDATE censo SET trincador = FALSE;

  -- Actualizar las chapas que son trincadores
  UPDATE censo
  SET trincador = TRUE
  WHERE chapa = ANY(chapas_trincadores);

  GET DIAGNOSTICS filas_actualizadas = ROW_COUNT;

  RETURN filas_actualizadas;
END;
$$ LANGUAGE plpgsql;

-- Ejemplo de uso:
-- SELECT actualizar_trincadores_desde_array(ARRAY['221', '190', '330', '450', '501']);

-- =====================================================
-- OPCIÓN 4: Función para actualizar trincador por fecha
-- =====================================================
-- Esta función actualiza los trincadores para una fecha específica
-- desde una tabla temporal

CREATE OR REPLACE FUNCTION actualizar_trincadores_por_fecha(
  fecha_censo DATE,
  chapas_trincadores TEXT[]
)
RETURNS INTEGER AS $$
DECLARE
  filas_actualizadas INTEGER;
BEGIN
  -- Resetear trincadores para la fecha específica
  UPDATE censo
  SET trincador = FALSE
  WHERE fecha = fecha_censo;

  -- Actualizar las chapas que son trincadores para esa fecha
  UPDATE censo
  SET trincador = TRUE
  WHERE fecha = fecha_censo
    AND chapa = ANY(chapas_trincadores);

  GET DIAGNOSTICS filas_actualizadas = ROW_COUNT;

  RETURN filas_actualizadas;
END;
$$ LANGUAGE plpgsql;

-- Ejemplo de uso:
-- SELECT actualizar_trincadores_por_fecha(
--   '2025-11-17'::DATE,
--   ARRAY['221', '190', '330']
-- );

-- =====================================================
-- CONSULTAS DE VERIFICACIÓN
-- =====================================================

-- Ver todas las chapas que son trincadores
-- SELECT chapa, posicion, fecha, trincador
-- FROM censo
-- WHERE trincador = TRUE
-- ORDER BY posicion;

-- Contar cuántos trincadores hay por fecha
-- SELECT fecha, COUNT(*) as total_trincadores
-- FROM censo
-- WHERE trincador = TRUE
-- GROUP BY fecha
-- ORDER BY fecha DESC;

-- Ver trincadores entre dos posiciones
-- SELECT chapa, posicion, trincador
-- FROM censo
-- WHERE trincador = TRUE
--   AND posicion BETWEEN 100 AND 200
--   AND fecha = CURRENT_DATE
-- ORDER BY posicion;

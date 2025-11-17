-- =====================================================
-- FUNCIONES PARA CONTAR TRINCADORES ENTRE POSICIONES
-- =====================================================
-- Estas funciones calculan cuántos trincadores hay entre
-- la puerta de contratación y la posición del usuario
-- =====================================================

-- FUNCIÓN 1: Contar trincadores entre dos posiciones (lineal)
-- =====================================================
CREATE OR REPLACE FUNCTION contar_trincadores_entre(
  fecha_censo DATE,
  posicion_inicio INTEGER,
  posicion_fin INTEGER
)
RETURNS INTEGER AS $$
DECLARE
  cantidad_trincadores INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO cantidad_trincadores
  FROM censo
  WHERE fecha = fecha_censo
    AND trincador = TRUE
    AND color != 'red'  -- Excluir trabajadores no disponibles
    AND posicion > posicion_inicio
    AND posicion <= posicion_fin;

  RETURN COALESCE(cantidad_trincadores, 0);
END;
$$ LANGUAGE plpgsql;

-- Ejemplo de uso:
-- SELECT contar_trincadores_entre('2025-11-17', 50, 150);


-- FUNCIÓN 2: Contar trincadores en rango circular (SP: 1-449)
-- =====================================================
CREATE OR REPLACE FUNCTION contar_trincadores_circular_sp(
  fecha_censo DATE,
  posicion_puerta INTEGER,  -- Última puerta contratada
  posicion_usuario INTEGER  -- Posición del usuario
)
RETURNS INTEGER AS $$
DECLARE
  cantidad_trincadores INTEGER;
  LIMITE_SP CONSTANT INTEGER := 449;
BEGIN
  -- Caso 1: No hay wraparound (usuario está después de la puerta)
  IF posicion_usuario > posicion_puerta THEN
    SELECT COUNT(*)
    INTO cantidad_trincadores
    FROM censo
    WHERE fecha = fecha_censo
      AND trincador = TRUE
      AND color != 'red'
      AND posicion > posicion_puerta
      AND posicion <= posicion_usuario;

  -- Caso 2: Wraparound (usuario está antes de la puerta)
  ELSE
    SELECT COUNT(*)
    INTO cantidad_trincadores
    FROM censo
    WHERE fecha = fecha_censo
      AND trincador = TRUE
      AND color != 'red'
      AND (
        (posicion > posicion_puerta AND posicion <= LIMITE_SP) OR
        (posicion >= 1 AND posicion <= posicion_usuario)
      );
  END IF;

  RETURN COALESCE(cantidad_trincadores, 0);
END;
$$ LANGUAGE plpgsql;

-- Ejemplo de uso:
-- SELECT contar_trincadores_circular_sp('2025-11-17', 400, 50);


-- FUNCIÓN 3: Contar trincadores en rango circular (OC: 450-535)
-- =====================================================
CREATE OR REPLACE FUNCTION contar_trincadores_circular_oc(
  fecha_censo DATE,
  posicion_puerta INTEGER,  -- Última puerta contratada
  posicion_usuario INTEGER  -- Posición del usuario
)
RETURNS INTEGER AS $$
DECLARE
  cantidad_trincadores INTEGER;
  INICIO_OC CONSTANT INTEGER := 450;
  FIN_OC CONSTANT INTEGER := 535;
BEGIN
  -- Caso 1: No hay wraparound (usuario está después de la puerta)
  IF posicion_usuario > posicion_puerta THEN
    SELECT COUNT(*)
    INTO cantidad_trincadores
    FROM censo
    WHERE fecha = fecha_censo
      AND trincador = TRUE
      AND color != 'red'
      AND posicion > posicion_puerta
      AND posicion <= posicion_usuario;

  -- Caso 2: Wraparound (usuario está antes de la puerta)
  ELSE
    SELECT COUNT(*)
    INTO cantidad_trincadores
    FROM censo
    WHERE fecha = fecha_censo
      AND trincador = TRUE
      AND color != 'red'
      AND (
        (posicion > posicion_puerta AND posicion <= FIN_OC) OR
        (posicion >= INICIO_OC AND posicion <= posicion_usuario)
      );
  END IF;

  RETURN COALESCE(cantidad_trincadores, 0);
END;
$$ LANGUAGE plpgsql;

-- Ejemplo de uso:
-- SELECT contar_trincadores_circular_oc('2025-11-17', 500, 460);


-- FUNCIÓN 4: Función inteligente que detecta SP u OC automáticamente
-- =====================================================
CREATE OR REPLACE FUNCTION contar_trincadores_hasta_usuario(
  fecha_censo DATE,
  chapa_usuario VARCHAR(10),
  posicion_puerta INTEGER
)
RETURNS TABLE(
  trincadores_hasta_posicion INTEGER,
  posicion_usuario INTEGER,
  es_sp BOOLEAN
) AS $$
DECLARE
  pos_usuario INTEGER;
  es_servicio_publico BOOLEAN;
  cantidad_trincadores INTEGER;
  LIMITE_SP CONSTANT INTEGER := 449;
BEGIN
  -- Obtener posición del usuario
  SELECT posicion
  INTO pos_usuario
  FROM censo
  WHERE fecha = fecha_censo
    AND chapa = chapa_usuario
  LIMIT 1;

  -- Verificar si encontramos la posición
  IF pos_usuario IS NULL THEN
    RAISE EXCEPTION 'No se encontró la chapa % en el censo de fecha %', chapa_usuario, fecha_censo;
  END IF;

  -- Determinar si es SP (1-449) u OC (450-535)
  es_servicio_publico := pos_usuario <= LIMITE_SP;

  -- Calcular trincadores según el tipo
  IF es_servicio_publico THEN
    cantidad_trincadores := contar_trincadores_circular_sp(
      fecha_censo,
      posicion_puerta,
      pos_usuario
    );
  ELSE
    cantidad_trincadores := contar_trincadores_circular_oc(
      fecha_censo,
      posicion_puerta,
      pos_usuario
    );
  END IF;

  -- Retornar resultado
  RETURN QUERY SELECT
    cantidad_trincadores,
    pos_usuario,
    es_servicio_publico;
END;
$$ LANGUAGE plpgsql;

-- Ejemplo de uso:
-- SELECT * FROM contar_trincadores_hasta_usuario('2025-11-17', '221', 400);


-- =====================================================
-- VISTA: Resumen de trincadores por fecha
-- =====================================================
CREATE OR REPLACE VIEW vista_trincadores_resumen AS
SELECT
  fecha,
  COUNT(*) FILTER (WHERE trincador = TRUE) as total_trincadores,
  COUNT(*) FILTER (WHERE trincador = TRUE AND posicion <= 449) as trincadores_sp,
  COUNT(*) FILTER (WHERE trincador = TRUE AND posicion >= 450) as trincadores_oc,
  COUNT(*) FILTER (WHERE trincador = TRUE AND color = 'red') as trincadores_no_disponibles,
  COUNT(*) FILTER (WHERE trincador = TRUE AND color != 'red') as trincadores_disponibles
FROM censo
GROUP BY fecha
ORDER BY fecha DESC;

-- Ejemplo de uso:
-- SELECT * FROM vista_trincadores_resumen WHERE fecha = '2025-11-17';


-- =====================================================
-- CONSULTAS DE EJEMPLO
-- =====================================================

-- Listar todos los trincadores disponibles en una fecha
/*
SELECT chapa, posicion, color, estado
FROM censo
WHERE fecha = '2025-11-17'
  AND trincador = TRUE
  AND color != 'red'
ORDER BY posicion;
*/

-- Ver cuántos trincadores hay entre la posición 100 y 200
/*
SELECT contar_trincadores_entre('2025-11-17', 100, 200) as trincadores_entre_100_y_200;
*/

-- Ver cuántos trincadores hay hasta la posición de una chapa específica
/*
SELECT * FROM contar_trincadores_hasta_usuario('2025-11-17', '221', 400);
*/

-- Resumen de trincadores por fecha
/*
SELECT * FROM vista_trincadores_resumen LIMIT 10;
*/

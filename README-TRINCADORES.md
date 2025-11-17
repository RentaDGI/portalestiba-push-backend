# 📋 Implementación de Columna Trincador

Este documento explica cómo añadir y utilizar la columna `trincador` en la tabla `censo` de Supabase.

## 🎯 Objetivo

Detectar automáticamente si una chapa es trincador y calcular cuántos trincadores hay entre la puerta de contratación y la posición del usuario.

## 📂 Archivos SQL Incluidos

### 1. `add-trincador-column.sql`
Añade la columna `trincador` a la tabla `censo` en Supabase.

**Características:**
- Añade columna `trincador` tipo BOOLEAN (por defecto FALSE)
- Crea índice para optimizar consultas
- Incluye comentario descriptivo

**Cómo ejecutar:**
1. Abre Supabase Dashboard
2. Ve a SQL Editor
3. Copia y pega el contenido de `add-trincador-column.sql`
4. Ejecuta el script

### 2. `update-trincador-from-sheets.sql`
Proporciona múltiples métodos para actualizar los trincadores desde Google Sheets.

**Opciones disponibles:**

#### **Opción 1: Tabla Temporal**
Si importas los datos a una tabla temporal:
```sql
-- Crear tabla temporal
CREATE TEMP TABLE temp_trincadores (
  pos INTEGER,
  chapa VARCHAR(10),
  especialidad VARCHAR(10)
);

-- Importar datos (desde tu aplicación)
-- Luego ejecutar el UPDATE del script
```

#### **Opción 2: Lista Manual**
Si tienes una lista de chapas trincadoras:
```sql
UPDATE censo
SET trincador = TRUE
WHERE chapa IN ('221', '190', '330', '450', '501');
```

#### **Opción 3: Función con Array (RECOMENDADA)**
Desde tu backend, puedes llamar a la función SQL:
```sql
SELECT actualizar_trincadores_desde_array(
  ARRAY['221', '190', '330', '450', '501']
);
```

#### **Opción 4: Actualización por Fecha**
Para actualizar trincadores de una fecha específica:
```sql
SELECT actualizar_trincadores_por_fecha(
  '2025-11-17'::DATE,
  ARRAY['221', '190', '330']
);
```

### 3. `contar-trincadores-entre-posiciones.sql`
Funciones SQL para contar trincadores entre posiciones.

**Funciones incluidas:**

#### `contar_trincadores_entre(fecha, pos_inicio, pos_fin)`
Cuenta trincadores en rango lineal (sin wraparound).

**Ejemplo:**
```sql
SELECT contar_trincadores_entre('2025-11-17', 50, 150);
-- Retorna: cantidad de trincadores entre posición 50 y 150
```

#### `contar_trincadores_circular_sp(fecha, pos_puerta, pos_usuario)`
Cuenta trincadores en modo circular para SP (posiciones 1-449).

**Ejemplo:**
```sql
SELECT contar_trincadores_circular_sp('2025-11-17', 400, 50);
-- Retorna: trincadores entre puerta 400 y usuario en posición 50 (circular)
```

#### `contar_trincadores_circular_oc(fecha, pos_puerta, pos_usuario)`
Cuenta trincadores en modo circular para OC (posiciones 450-535).

**Ejemplo:**
```sql
SELECT contar_trincadores_circular_oc('2025-11-17', 500, 460);
-- Retorna: trincadores entre puerta 500 y usuario en posición 460 (circular)
```

#### `contar_trincadores_hasta_usuario(fecha, chapa, pos_puerta)`
Función inteligente que detecta automáticamente si es SP u OC.

**Ejemplo:**
```sql
SELECT * FROM contar_trincadores_hasta_usuario('2025-11-17', '221', 400);
-- Retorna: { trincadores_hasta_posicion, posicion_usuario, es_sp }
```

**Retorna:**
- `trincadores_hasta_posicion`: Cantidad de trincadores
- `posicion_usuario`: Posición del usuario en el censo
- `es_sp`: TRUE si es Servicio Público (1-449), FALSE si es OC (450-535)

---

## 🚀 Flujo de Implementación

### Paso 1: Añadir la columna
```bash
# Ejecutar en Supabase SQL Editor
add-trincador-column.sql
```

### Paso 2: Ejecutar funciones de actualización
```bash
# Ejecutar en Supabase SQL Editor
update-trincador-from-sheets.sql
contar-trincadores-entre-posiciones.sql
```

### Paso 3: Actualizar desde Google Sheets

#### Formato esperado del Google Sheet:
```
pos | chapa | especialidad
----|-------|-------------
1   | 221   | T
2   | 330   |
3   | 190   | T
50  | 450   | T
```

#### Desde tu backend (Node.js):
```javascript
// Ejemplo de integración
async function actualizarTrincadoresDesdeSheets() {
  // 1. Leer Google Sheets
  const response = await fetch(SHEETS_URL);
  const csvText = await response.text();
  const rows = csvText.split('\n').slice(1); // Saltar header

  // 2. Filtrar chapas con especialidad 'T'
  const chapasTrincadoras = rows
    .map(row => {
      const [pos, chapa, especialidad] = row.split(',');
      return { chapa, especialidad: especialidad?.trim().toUpperCase() };
    })
    .filter(item => item.especialidad === 'T')
    .map(item => item.chapa);

  // 3. Actualizar en Supabase
  const { data, error } = await supabase.rpc(
    'actualizar_trincadores_desde_array',
    { chapas_trincadores: chapasTrincadoras }
  );

  console.log(`Actualizados ${data} trincadores`);
}
```

---

## 🔍 Consultas de Verificación

### Ver todos los trincadores
```sql
SELECT chapa, posicion, fecha, trincador, color
FROM censo
WHERE trincador = TRUE
  AND fecha = '2025-11-17'
ORDER BY posicion;
```

### Contar trincadores por fecha
```sql
SELECT fecha, COUNT(*) as total_trincadores
FROM censo
WHERE trincador = TRUE
GROUP BY fecha
ORDER BY fecha DESC;
```

### Resumen completo de trincadores
```sql
SELECT * FROM vista_trincadores_resumen
WHERE fecha = '2025-11-17';
```

**Retorna:**
- `total_trincadores`: Total de trincadores
- `trincadores_sp`: Trincadores en SP (1-449)
- `trincadores_oc`: Trincadores en OC (450-535)
- `trincadores_no_disponibles`: Trincadores con color='red'
- `trincadores_disponibles`: Trincadores con color!='red'

### Ver trincadores disponibles entre dos posiciones
```sql
SELECT chapa, posicion, color, estado
FROM censo
WHERE fecha = '2025-11-17'
  AND trincador = TRUE
  AND color != 'red'  -- Solo disponibles
  AND posicion BETWEEN 100 AND 200
ORDER BY posicion;
```

---

## 📊 Integración con la API del Backend

### Endpoint recomendado para actualizar trincadores
```javascript
// server.js
app.post('/api/update-trincadores', async (req, res) => {
  try {
    // Leer Google Sheets
    const SHEETS_URL = 'TU_URL_DEL_SHEET_TRINCADORES';
    const response = await fetch(SHEETS_URL);
    const csvText = await response.text();
    const rows = csvText.split('\n').slice(1);

    // Procesar datos
    const chapasTrincadoras = rows
      .map(row => {
        const [pos, chapa, especialidad] = row.split(',');
        return { chapa, especialidad: especialidad?.trim().toUpperCase() };
      })
      .filter(item => item.especialidad === 'T')
      .map(item => item.chapa);

    // Actualizar en Supabase
    const { data, error } = await supabase.rpc(
      'actualizar_trincadores_desde_array',
      { chapas_trincadores: chapasTrincadoras }
    );

    if (error) throw error;

    res.json({
      success: true,
      actualizados: data,
      total_trincadores: chapasTrincadoras.length
    });

  } catch (error) {
    console.error('Error actualizando trincadores:', error);
    res.status(500).json({ error: 'Error al actualizar trincadores' });
  }
});
```

### Endpoint para obtener trincadores hasta la posición del usuario
```javascript
app.get('/api/trincadores-hasta-usuario', async (req, res) => {
  const { chapa, posicion_puerta, fecha } = req.query;

  try {
    const { data, error } = await supabase.rpc(
      'contar_trincadores_hasta_usuario',
      {
        fecha_censo: fecha || new Date().toISOString().split('T')[0],
        chapa_usuario: chapa,
        posicion_puerta: parseInt(posicion_puerta)
      }
    );

    if (error) throw error;

    res.json({
      success: true,
      ...data[0]
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener trincadores' });
  }
});
```

---

## 🎨 Vista en el Frontend

Basándose en la implementación de referencia, así se mostraría:

```javascript
// Obtener datos
const response = await fetch(`/api/trincadores-hasta-usuario?chapa=${chapa}&posicion_puerta=${puerta}`);
const { trincadores_hasta_posicion } = await response.json();

// Mostrar en UI
posicionTrincaElement.innerHTML =
  `⚡ ${trincadores_hasta_posicion} trincadores hasta la puerta`;
```

**Estilo visual:**
```css
.posicion-trinca {
  color: #FCD34D; /* Dorado */
  font-size: 0.85rem;
  font-weight: 500;
}
```

---

## ⚠️ Consideraciones Importantes

### 1. Sincronización
- Ejecutar la actualización de trincadores DESPUÉS de actualizar el censo
- Recomendado: Crear un job/cron que sincronice cada X minutos
- Alternativamente: Ejecutar al inicio de sesión del usuario

### 2. Performance
- El índice en `trincador` optimiza las consultas WHERE trincador = TRUE
- La función `contar_trincadores_hasta_usuario` es eficiente para consultas individuales
- Para consultas masivas, usar la vista `vista_trincadores_resumen`

### 3. Caché
- Cachear el resultado de `contar_trincadores_hasta_usuario` por 5 minutos
- Invalidar caché al actualizar trincadores desde Sheets

### 4. Validación
- Asegurar que la columna `especialidad` en Sheets contenga solo 'T' o esté vacía
- Validar que las chapas existen en la tabla censo antes de actualizar

---

## 🧪 Testing

### Probar la columna
```sql
-- Ver estructura de la tabla
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'censo' AND column_name = 'trincador';
```

### Probar actualización
```sql
-- Marcar chapas como trincadoras
SELECT actualizar_trincadores_desde_array(ARRAY['221', '190']);

-- Verificar
SELECT chapa, trincador FROM censo WHERE chapa IN ('221', '190');
```

### Probar conteo
```sql
-- Caso sin wraparound
SELECT contar_trincadores_entre('2025-11-17', 10, 50);

-- Caso con wraparound (SP)
SELECT contar_trincadores_circular_sp('2025-11-17', 440, 20);

-- Caso automático
SELECT * FROM contar_trincadores_hasta_usuario('2025-11-17', '221', 400);
```

---

## 📝 Notas Adicionales

1. **Exclusión de rojos**: Las funciones de conteo excluyen automáticamente trabajadores con `color = 'red'` (no disponibles)

2. **Modo circular**: Las funciones detectan automáticamente cuando hay "wraparound" (la puerta está después de la posición del usuario en el censo circular)

3. **SP vs OC**: El sistema distingue automáticamente:
   - **SP (Servicio Público)**: Posiciones 1-449
   - **OC (Operaciones Complementarias)**: Posiciones 450-535

4. **Vista resumen**: Usar `vista_trincadores_resumen` para dashboards y reportes

---

## 🔗 Referencias

- Repositorio de referencia: [PortalEstibaVLC](https://github.com/TheViking816/PortalEstibaVLC/tree/fix-auth-and-trinca-feature)
- Documentación Supabase: [RPC Functions](https://supabase.com/docs/guides/database/functions)
- Lógica de trincadores original: `sheets.js` líneas 554-725

---

## 📧 Soporte

Si encuentras algún problema o necesitas ayuda adicional, revisa:
1. Los logs de Supabase SQL Editor
2. La consola del navegador para errores del frontend
3. Los logs del servidor Node.js para errores del backend

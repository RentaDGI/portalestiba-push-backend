# 🚀 Guía Rápida: Importar Trincadores desde Google Sheets

Esta guía te ayudará a importar los datos de trincadores desde tu Google Sheet a Supabase de forma rápida y sencilla.

## 📋 Requisitos Previos

1. ✅ Haber ejecutado el script `add-trincador-column.sql` en Supabase
2. ✅ Tener un Google Sheet con las columnas: `pos`, `chapa`, `trinca`

## 📊 Formato del Google Sheet

Tu Google Sheet debe tener este formato:

| pos | chapa | trinca |
|-----|-------|--------|
| 1   | 221   | T      |
| 2   | 330   |        |
| 3   | 190   | T      |
| 4   | 450   |        |
| ... | ...   | ...    |

**Columnas:**
- **pos**: Posición en el censo (1-535)
- **chapa**: Número de chapa del trabajador
- **trinca**: Poner `T` si es trincador, dejar en blanco si no lo es

## ⚡ Método Rápido: Convertidor HTML

### Paso 1: Abrir el convertidor
Abre el archivo `convertir-trincadores-csv-a-sql.html` en tu navegador.

### Paso 2: Copiar datos desde Google Sheets
1. Abre tu Google Sheet
2. Selecciona todas las celdas con datos (incluyendo encabezados)
3. Copia (Ctrl+C / Cmd+C)

### Paso 3: Convertir a SQL
1. Pega los datos en el área de texto del convertidor
2. Haz clic en **"🔄 Convertir a SQL"**
3. Revisa las estadísticas mostradas:
   - **Total Filas**: Total de filas procesadas
   - **Trincadores (SP)**: Trincadores válidos en posiciones 1-449
   - **Ignorados (OC)**: Filas de OC (450-535) que fueron ignoradas

### Paso 4: Ejecutar SQL en Supabase
1. Copia el SQL generado (botón **"📋 Copiar SQL"** o descarga con **"💾 Descargar SQL"**)
2. Ve a **Supabase Dashboard** → **SQL Editor**
3. Pega el SQL y ejecuta

¡Listo! Los trincadores se habrán actualizado en la tabla `censo`.

---

## ⚠️ Reglas Importantes

### Solo SP tiene Trincadores
- **SP (Posiciones 1-449)**: Pueden ser trincadores
- **OC (Posiciones 450-535)**: NO pueden ser trincadores

El convertidor automáticamente:
- ✅ Acepta trincadores de SP (posiciones 1-449)
- ❌ Ignora trincadores de OC (posiciones 450-535)
- 📊 Muestra estadísticas de cuántos fueron procesados vs ignorados

### Los Usuarios de OC NO Verán Trincadores
El endpoint `/api/trincadores/contar` retorna:

**Para usuarios de SP:**
```json
{
  "success": true,
  "disponible": true,
  "trincadores_hasta_posicion": 5,
  "posicion_usuario": 150,
  "es_sp": true,
  "tipo": "Servicio Público"
}
```

**Para usuarios de OC:**
```json
{
  "success": false,
  "disponible": false,
  "mensaje": "La funcionalidad de trincadores solo está disponible para Servicio Público (SP)",
  "posicion_usuario": 475,
  "es_sp": false,
  "tipo": "Operaciones Complementarias"
}
```

---

## 🔍 Verificación

Después de importar, verifica que los datos se importaron correctamente:

### SQL de Verificación

```sql
-- Ver total de trincadores
SELECT COUNT(*) as total_trincadores
FROM censo
WHERE trincador = TRUE;

-- Ver listado de trincadores
SELECT chapa, posicion, trincador
FROM censo
WHERE trincador = TRUE
ORDER BY posicion;

-- Verificar que NO hay trincadores en OC (debe retornar 0)
SELECT COUNT(*) as trincadores_en_oc
FROM censo
WHERE trincador = TRUE
  AND posicion >= 450;
```

### Resultado Esperado
- ✅ `total_trincadores`: Número de chapas con especialidad T (solo SP)
- ✅ `trincadores_en_oc`: **Debe ser 0**

---

## 🛠️ Troubleshooting

### Problema: "No se generó SQL"
**Solución:** Verifica que el CSV tenga las columnas correctas: `pos`, `chapa`, `trinca` (en cualquier orden).

### Problema: "Total Trincadores = 0"
**Posibles causas:**
1. Las chapas en el Sheet tienen espacios o caracteres especiales
2. La columna `trinca` no tiene valores `T` (mayúscula)
3. Solo hay datos de OC (posiciones 450-535)

**Solución:** Verifica los datos del Sheet y asegúrate de que:
- La columna `trinca` tiene letra `T` (mayúscula) para los trincadores
- Hay al menos algunos trincadores en posiciones 1-449

### Problema: "El frontend muestra trincadores a usuarios de OC"
**Solución:** Verifica en el frontend que estés usando el campo `disponible` para decidir si mostrar la funcionalidad:

```javascript
const response = await fetch(`/api/trincadores/contar?chapa=${chapa}&posicion_puerta=${puerta}`);
const data = await response.json();

if (data.disponible) {
  // Mostrar información de trincadores
  console.log(`⚡ ${data.trincadores_hasta_posicion} trincadores`);
} else {
  // No mostrar nada (usuario es de OC)
  console.log(data.mensaje);
}
```

---

## 📈 Actualización Automática desde Sheets

Si quieres automatizar la actualización, puedes crear un script que:

1. Lee el Google Sheet cada X minutos
2. Llama al endpoint `/api/trincadores/update` con el array de chapas

```javascript
// Ejemplo de actualización automática
async function actualizarTrincadoresDesdeSheets() {
  const SHEETS_URL = 'https://docs.google.com/spreadsheets/d/e/...';

  const response = await fetch('/api/trincadores/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sheets_url: SHEETS_URL })
  });

  const result = await response.json();
  console.log(`Actualizados ${result.total_trincadores} trincadores`);
}

// Ejecutar cada 5 minutos
setInterval(actualizarTrincadoresDesdeSheets, 5 * 60 * 1000);
```

---

## 🎯 Resumen

1. ✅ Abre `convertir-trincadores-csv-a-sql.html`
2. ✅ Copia/pega datos desde Google Sheets
3. ✅ Convierte a SQL
4. ✅ Ejecuta en Supabase SQL Editor
5. ✅ Verifica que solo hay trincadores en SP (1-449)
6. ✅ Los usuarios de OC no verán la funcionalidad

¡Todo listo! Los trincadores están ahora en la base de datos y el sistema solo los mostrará a usuarios de SP.

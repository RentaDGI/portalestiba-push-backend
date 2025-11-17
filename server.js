const express = require('express');
const webpush = require('web-push');
const bodyParser = require('body-parser');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const port = process.env.PORT || 5000;

// Habilitar CORS para TODOS los orígenes (como lo dejamos)
app.use(cors());

app.use(bodyParser.json());

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
     console.error("ERROR: Las credenciales de Supabase (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) no están configuradas en las variables de entorno.");
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

const vapidKeys = {
    publicKey: process.env.VAPID_PUBLIC_KEY, 
    privateKey: process.env.VAPID_PRIVATE_KEY, 
};

if (!vapidKeys.publicKey || !vapidKeys.privateKey) {
    console.error("ERROR: Las claves VAPID (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY) no están configuradas en las variables de entorno.");
}
if (!process.env.WEB_PUSH_EMAIL) {
    console.error("ERROR: El email de Web Push (WEB_PUSH_EMAIL) no está configurado en las variables de entorno.");
}

webpush.setVapidDetails(
    `mailto:${process.env.WEB_PUSH_EMAIL}`, 
    vapidKeys.publicKey,
    vapidKeys.privateKey
);

// 1. Ruta para guardar la suscripción del usuario (desde el frontend)
app.post('/api/push/subscribe', async (req, res) => {
    const subscription = req.body;
    const user_chapa = req.body.user_chapa || null; 

    console.log('Received subscription request. Body:', subscription);

    if (!subscription || typeof subscription !== 'object' ||
        !subscription.endpoint || typeof subscription.endpoint !== 'string' ||
        !subscription.keys || typeof subscription.keys !== 'object' ||
        !subscription.keys.p256dh || typeof subscription.keys.p256dh !== 'string' ||
        !subscription.keys.auth || typeof subscription.keys.auth !== 'string') {
        console.error('Invalid subscription: Missing or invalid required fields.');
        return res.status(400).json({ error: 'Invalid subscription format: missing or invalid required fields.' });
    }

    try {
        const { data, error } = await supabase
            .from('push_subscriptions')
            .upsert({
                endpoint: subscription.endpoint,
                p256dh: subscription.keys.p256dh,
                auth: subscription.keys.auth,
                user_chapa: user_chapa
            }, {
                onConflict: 'endpoint' 
            });

        if (error) {
            console.error('Error al guardar suscripción en Supabase:', error);
            return res.status(500).json({ error: 'Failed to save subscription in database.' });
        }

        console.log('Suscripción registrada/actualizada en Supabase:', subscription.endpoint, user_chapa ? `(chapa: ${user_chapa})` : '(sin chapa)');
        res.status(201).json({ message: 'Subscription saved and persisted.' });

    } catch (e) {
        console.error('Excepción al suscribir:', e);
        res.status(500).json({ error: 'Internal server error during subscription process.' });
    }
});

// 2. Ruta para eliminar la suscripción del usuario
app.post('/api/push/unsubscribe', async (req, res) => {
    const endpointToRemove = req.body.endpoint;

    if (!endpointToRemove || typeof endpointToRemove !== 'string') {
        console.error('Invalid unsubscription request: Missing or invalid endpoint.');
        return res.status(400).json({ error: 'Endpoint is required for unsubscription.' });
    }

    try {
        const { error } = await supabase
            .from('push_subscriptions')
            .delete()
            .eq('endpoint', endpointToRemove);

        if (error) {
            console.error('Error al eliminar suscripción de Supabase:', error);
            return res.status(500).json({ error: 'Failed to remove subscription from database.' });
        }

        console.log('Suscripción eliminada de Supabase:', endpointToRemove);
        res.status(200).json({ message: 'Subscription removed and unpersisted.' });

    } catch (e) {
        console.error('Excepción al desuscribir:', e);
        res.status(500).json({ error: 'Internal server error during unsubscription process.' });
    }
});

// 3. Ruta para ENVIAR una notificación de "Nueva Contratación" (llamada por la Edge Function)
app.post('/api/push/notify-new-hire', async (req, res) => {
    const { title, body, url, chapa_target = null } = req.body;
    
    let { data: subscriptions, error } = await supabase
        .from('push_subscriptions')
        .select('*');

    if (error) {
        console.error('Error al obtener suscripciones de Supabase:', error);
        return res.status(500).json({ error: 'Failed to retrieve subscriptions.' });
    }

    let targetSubscriptions = subscriptions || []; 

    if (chapa_target) {
        targetSubscriptions = targetSubscriptions.filter(sub => sub.user_chapa === chapa_target.toString());
        console.log(`Filtrando notificaciones para chapa_target: ${chapa_target}. Suscripciones encontradas: ${targetSubscriptions.length}`);
        if (targetSubscriptions.length === 0) {
            return res.status(200).json({ message: `No active subscriptions found for chapa_target: ${chapa_target}.` });
        }
    } else {
        console.log('No se proporcionó chapa_target. Enviando a TODOS los suscriptores.');
    }

    // --- INICIO DE LA MODIFICACIÓN ---
    const payload = JSON.stringify({
        title: title || '¡Nueva Contratación Disponible!',
        body: body || 'Revisa los detalles de la última incorporación a nuestro equipo.',
        url: url || '/#contratacion', // <-- ¡CAMBIADO! Añade el hash
    });
    // --- FIN DE LA MODIFICACIÓN ---

    console.log(`Enviando notificación a ${targetSubscriptions.length} suscriptores persistentes...`);

    const notificationsPromises = targetSubscriptions.map(async (sub, index) => {
        const pushSubscription = {
            endpoint: sub.endpoint,
            keys: {
                p256dh: sub.p256dh,
                auth: sub.auth
            }
        };
        try {
            await webpush.sendNotification(pushSubscription, payload);
            console.log(`Notificación enviada a suscriptor ${index + 1} (chapa: ${sub.user_chapa || 'N/A'})`);
            return { endpoint: sub.endpoint, status: 'success', remove: false };
        } catch (error) {
            console.error(`Error enviando notificación a suscriptor ${index + 1} (chapa: ${sub.user_chapa || 'N/A'}, endpoint: ${sub.endpoint}):`, error);
            if (error.statusCode === 410 || error.statusCode === 404) {
                console.log(`Suscripción inválida/expirada eliminada de BD: ${sub.endpoint}`);
                await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
                return { endpoint: sub.endpoint, status: 'failed', remove: true };
            }
            return { endpoint: sub.endpoint, status: 'failed', remove: false };
        }
    });

    await Promise.allSettled(notificationsPromises); 

    console.log(`Finalizado el envío de notificaciones.`);
    res.status(200).json({ 
        message: 'Notifications process initiated. Check logs for individual results.', 
    });
});
// =====================================================
// ENDPOINTS PARA TRINCADORES
// =====================================================
// Añadir estos endpoints al server.js antes de app.listen()

// 4. Ruta para ACTUALIZAR trincadores desde Google Sheets
app.post('/api/trincadores/update', async (req, res) => {
    const { sheets_url, chapas_trincadores } = req.body;

    try {
        let chapasArray = [];

        // Opción 1: Recibir array directamente desde el frontend
        if (chapas_trincadores && Array.isArray(chapas_trincadores)) {
            chapasArray = chapas_trincadores;
            console.log(`Actualizando ${chapasArray.length} trincadores desde array proporcionado`);
        }
        // Opción 2: Leer desde Google Sheets URL
        else if (sheets_url) {
            console.log(`Leyendo trincadores desde Google Sheets: ${sheets_url}`);

            const response = await fetch(sheets_url, {
                cache: 'no-store'
            });

            if (!response.ok) {
                throw new Error(`Error al obtener Google Sheets: ${response.status} ${response.statusText}`);
            }

            const csvText = await response.text();
            const rows = csvText.split('\n').slice(1); // Saltar header

            // Procesar CSV: pos, chapa, especialidad
            chapasArray = rows
                .map(row => {
                    const [pos, chapa, especialidad] = row.split(',');
                    return {
                        chapa: chapa?.trim(),
                        especialidad: especialidad?.trim().toUpperCase()
                    };
                })
                .filter(item => item.chapa && item.especialidad === 'T')
                .map(item => item.chapa);

            console.log(`Encontrados ${chapasArray.length} trincadores en Google Sheets`);
        } else {
            return res.status(400).json({
                error: 'Debe proporcionar "sheets_url" o "chapas_trincadores"'
            });
        }

        // Actualizar en Supabase usando la función SQL
        const { data, error } = await supabase.rpc(
            'actualizar_trincadores_desde_array',
            { chapas_trincadores: chapasArray }
        );

        if (error) {
            console.error('Error al actualizar trincadores en Supabase:', error);
            return res.status(500).json({
                error: 'Error al actualizar trincadores en base de datos',
                details: error.message
            });
        }

        console.log(`✅ Trincadores actualizados exitosamente: ${data} registros`);

        res.status(200).json({
            success: true,
            registros_actualizados: data,
            total_trincadores: chapasArray.length,
            chapas: chapasArray
        });

    } catch (e) {
        console.error('Excepción al actualizar trincadores:', e);
        res.status(500).json({
            error: 'Error interno del servidor',
            details: e.message
        });
    }
});

// 5. Ruta para CONTAR trincadores hasta la posición del usuario
app.get('/api/trincadores/contar', async (req, res) => {
    const { chapa, posicion_puerta, fecha } = req.query;

    if (!chapa || !posicion_puerta) {
        return res.status(400).json({
            error: 'Parámetros requeridos: chapa, posicion_puerta'
        });
    }

    try {
        const fechaCenso = fecha || new Date().toISOString().split('T')[0];

        console.log(`Contando trincadores para chapa ${chapa}, puerta ${posicion_puerta}, fecha ${fechaCenso}`);

        // Llamar a la función SQL que detecta automáticamente SP/OC
        const { data, error } = await supabase.rpc(
            'contar_trincadores_hasta_usuario',
            {
                fecha_censo: fechaCenso,
                chapa_usuario: chapa,
                posicion_puerta: parseInt(posicion_puerta)
            }
        );

        if (error) {
            console.error('Error al contar trincadores:', error);
            return res.status(500).json({
                error: 'Error al contar trincadores',
                details: error.message
            });
        }

        if (!data || data.length === 0) {
            return res.status(404).json({
                error: `No se encontró la chapa ${chapa} en el censo de fecha ${fechaCenso}`
            });
        }

        const resultado = data[0];

        // IMPORTANTE: Solo usuarios de SP (posiciones 1-449) tienen trincadores
        // Los usuarios de OC (450-535) NO deben ver esta funcionalidad
        if (!resultado.es_sp) {
            console.log(`⚠️ Usuario de OC (posición ${resultado.posicion_usuario}) - No aplica funcionalidad de trincadores`);
            return res.status(200).json({
                success: false,
                disponible: false,
                mensaje: 'La funcionalidad de trincadores solo está disponible para Servicio Público (SP)',
                chapa: chapa,
                posicion_usuario: resultado.posicion_usuario,
                es_sp: false,
                tipo: 'Operaciones Complementarias'
            });
        }

        console.log(`✅ Resultado: ${resultado.trincadores_hasta_posicion} trincadores, posición ${resultado.posicion_usuario}, SP`);

        res.status(200).json({
            success: true,
            disponible: true,
            chapa: chapa,
            fecha: fechaCenso,
            trincadores_hasta_posicion: resultado.trincadores_hasta_posicion,
            posicion_usuario: resultado.posicion_usuario,
            posicion_puerta: parseInt(posicion_puerta),
            es_sp: resultado.es_sp,
            tipo: 'Servicio Público'
        });

    } catch (e) {
        console.error('Excepción al contar trincadores:', e);
        res.status(500).json({
            error: 'Error interno del servidor',
            details: e.message
        });
    }
});

// 6. Ruta para obtener RESUMEN de trincadores por fecha
app.get('/api/trincadores/resumen', async (req, res) => {
    const { fecha } = req.query;

    try {
        const fechaCenso = fecha || new Date().toISOString().split('T')[0];

        console.log(`Obteniendo resumen de trincadores para fecha: ${fechaCenso}`);

        // Consultar la vista de resumen
        const { data, error } = await supabase
            .from('vista_trincadores_resumen')
            .select('*')
            .eq('fecha', fechaCenso)
            .single();

        if (error) {
            // Si no hay datos para esa fecha, retornar estructura vacía
            if (error.code === 'PGRST116') {
                return res.status(200).json({
                    success: true,
                    fecha: fechaCenso,
                    total_trincadores: 0,
                    trincadores_sp: 0,
                    trincadores_oc: 0,
                    trincadores_no_disponibles: 0,
                    trincadores_disponibles: 0,
                    message: 'No hay datos de trincadores para esta fecha'
                });
            }

            console.error('Error al obtener resumen de trincadores:', error);
            return res.status(500).json({
                error: 'Error al obtener resumen de trincadores',
                details: error.message
            });
        }

        console.log(`✅ Resumen obtenido: ${data.total_trincadores} trincadores totales`);

        res.status(200).json({
            success: true,
            ...data
        });

    } catch (e) {
        console.error('Excepción al obtener resumen de trincadores:', e);
        res.status(500).json({
            error: 'Error interno del servidor',
            details: e.message
        });
    }
});

// 7. Ruta para obtener LISTA de trincadores disponibles
app.get('/api/trincadores/lista', async (req, res) => {
    const { fecha, disponibles_solo } = req.query;

    try {
        const fechaCenso = fecha || new Date().toISOString().split('T')[0];
        const soloDisponibles = disponibles_solo === 'true';

        console.log(`Obteniendo lista de trincadores para fecha: ${fechaCenso}, solo disponibles: ${soloDisponibles}`);

        let query = supabase
            .from('censo')
            .select('chapa, posicion, color, estado, observaciones')
            .eq('fecha', fechaCenso)
            .eq('trincador', true)
            .order('posicion', { ascending: true });

        // Filtrar solo disponibles (excluir color red)
        if (soloDisponibles) {
            query = query.neq('color', 'red');
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error al obtener lista de trincadores:', error);
            return res.status(500).json({
                error: 'Error al obtener lista de trincadores',
                details: error.message
            });
        }

        console.log(`✅ Encontrados ${data.length} trincadores`);

        res.status(200).json({
            success: true,
            fecha: fechaCenso,
            total: data.length,
            trincadores: data
        });

    } catch (e) {
        console.error('Excepción al obtener lista de trincadores:', e);
        res.status(500).json({
            error: 'Error interno del servidor',
            details: e.message
        });
    }
});

app.listen(port, () => {
    console.log(`Backend de notificaciones corriendo en http://localhost:${port}`);
    console.log('VAPID Public Key (para tu frontend):', vapidKeys.publicKey || 'NO CONFIGURADA (VER VAR. ENTORNO)');
    console.log('¡No compartas la VAPID Private Key!');
});

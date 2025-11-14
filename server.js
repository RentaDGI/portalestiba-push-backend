const express = require('express');
const webpush = require('web-push');
const bodyParser = require('body-parser');
const cors = require('cors');
// Importar el cliente de Supabase
const { createClient } = require('@supabase/supabase-js');

const app = express();
const port = process.env.PORT || 5000;

// =========================================================================
// Configuración de CORS para desarrollo local o frontend desplegado.
// Debería permitir 'http://localhost:8080' y 'http://127.0.0.1:8080' para desarrollo.
// En producción, debería ser la URL de tu frontend desplegado (ej. 'https://tu-pwa.com').
// =========================================================================
app.use(cors({
    origin: ['http://localhost:8080', 'http://127.0.0.1:8080'], // Para desarrollo local
    methods: ['GET', 'POST', 'PUT', 'DELETE'], 
    allowedHeaders: ['Content-Type', 'Authorization'] 
}));

app.use(bodyParser.json());

// =========================================================================
// ¡Inicialización de Supabase para el backend!
// Estas variables de entorno (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
// DEBEN CONFIGURARSE en Vercel.
// =========================================================================
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error("ERROR: Las credenciales de Supabase (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) no están configuradas en las variables de entorno.");
    // No salir en desarrollo, pero es crítico en producción
    // process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

// =========================================================================
// Configuración de Web-Push (claves VAPID y email leídos de variables de entorno)
// (DEBES CONFIGURAR VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY y WEB_PUSH_EMAIL en Vercel!)
// =========================================================================
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

// ===============================================
// RUTAS DE LA API PARA NOTIFICACIONES PUSH (Ahora con persistencia en Supabase)
// ===============================================

// 1. Ruta para guardar la suscripción del usuario (desde el frontend)
app.post('/api/push/subscribe', async (req, res) => {
    const subscription = req.body;
    // El frontend no siempre envía user_chapa, así que puede ser null o undefined
    const user_chapa = req.body.user_chapa || null; // Opcional

    if (!subscription || !subscription.endpoint || !subscription.keys || !subscription.keys.p256dh || !subscription.keys.auth) {
        return res.status(400).json({ error: 'Invalid subscription format.' });
    }

    try {
        // Intentar insertar la suscripción en Supabase
        const { data, error } = await supabase
            .from('push_subscriptions')
            .upsert({
                endpoint: subscription.endpoint,
                p256dh: subscription.keys.p256dh,
                auth: subscription.keys.auth,
                user_chapa: user_chapa // Guardar la chapa si se proporciona
            }, {
                onConflict: 'endpoint' // Si el endpoint ya existe, actualiza (no crea duplicados)
            });

        if (error) {
            console.error('Error al guardar suscripción en Supabase:', error);
            return res.status(500).json({ error: 'Failed to save subscription.' });
        }

        console.log('Suscripción registrada/actualizada en Supabase:', subscription.endpoint);
        res.status(201).json({ message: 'Subscription saved and persisted.' });

    } catch (e) {
        console.error('Excepción al suscribir:', e);
        res.status(500).json({ error: 'Internal server error during subscription.' });
    }
});

// 2. Ruta para eliminar la suscripción del usuario
app.post('/api/push/unsubscribe', async (req, res) => {
    const endpointToRemove = req.body.endpoint;

    if (!endpointToRemove) {
        return res.status(400).json({ error: 'Endpoint is required for unsubscription.' });
    }

    try {
        const { error } = await supabase
            .from('push_subscriptions')
            .delete()
            .eq('endpoint', endpointToRemove);

        if (error) {
            console.error('Error al eliminar suscripción de Supabase:', error);
            return res.status(500).json({ error: 'Failed to remove subscription.' });
        }

        console.log('Suscripción eliminada de Supabase:', endpointToRemove);
        res.status(200).json({ message: 'Subscription removed and unpersisted.' });

    } catch (e) {
        console.error('Excepción al desuscribir:', e);
        res.status(500).json({ error: 'Internal server error during unsubscription.' });
    }
});

// 3. Ruta para ENVIAR una notificación de "Nueva Contratación" (llamada por la Edge Function)
app.post('/api/push/notify-new-hire', async (req, res) => {
    const { title, body, url, chapa_target = null } = req.body; 
    
    // 1. Obtener todas las suscripciones persistentes de Supabase
    let { data: subscriptions, error } = await supabase
        .from('push_subscriptions')
        .select('*');

    if (error) {
        console.error('Error al obtener suscripciones de Supabase:', error);
        return res.status(500).json({ error: 'Failed to retrieve subscriptions.' });
    }

    if (!subscriptions || subscriptions.length === 0) {
        console.log('No hay suscriptores registrados en Supabase para enviar la notificación.');
        return res.status(200).json({ message: 'No active subscriptions to notify.' });
    }

    // Opcional: Filtrar por chapa si la Edge Function envía un user_chapa específico
    let targetSubscriptions = subscriptions;
    if (chapa_target) {
        targetSubscriptions = subscriptions.filter(sub => sub.user_chapa === chapa_target.toString());
        console.log(`Filtrando notificaciones para chapa_target: ${chapa_target}. Suscripciones encontradas: ${targetSubscriptions.length}`);
        if (targetSubscriptions.length === 0) {
            return res.status(200).json({ message: `No active subscriptions found for chapa_target: ${chapa_target}.` });
        }
    }


    const payload = JSON.stringify({
        title: title || '¡Nueva Contratación Disponible!',
        body: body || 'Revisa los detalles de la última incorporación a nuestro equipo.',
        url: url || '/', 
    });

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
            console.log(`Notificación enviada a suscriptor ${index + 1} (${sub.endpoint})`);
            return { endpoint: sub.endpoint, status: 'success', remove: false };
        } catch (error) {
            console.error(`Error enviando notificación a suscriptor ${index + 1} (${sub.endpoint}):`, error);
            // Si la suscripción falla (Gone: 410, Not Found: 404), marcar para eliminar
            if (error.statusCode === 410 || error.statusCode === 404) {
                console.log(`Suscripción inválida/expirada eliminada: ${sub.endpoint}`);
                // Eliminarla directamente de la base de datos
                await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
                return { endpoint: sub.endpoint, status: 'failed', remove: true };
            }
            return { endpoint: sub.endpoint, status: 'failed', remove: false };
        }
    });

    const results = await Promise.all(notificationsPromises);

    // Opcional: Podrías querer loggear o responder con los resultados detallados
    res.status(200).json({ 
        message: 'Notifications sent.', 
        totalAttempted: targetSubscriptions.length,
        totalSent: results.filter(r => r.status === 'success').length,
        totalRemoved: results.filter(r => r.remove).length,
        // results: results // Descomentar para debug detallado de cada resultado
    });
});


app.listen(port, () => {
    console.log(`Backend de notificaciones corriendo en http://localhost:${port}`);
    console.log('VAPID Public Key (para tu frontend):', vapidKeys.publicKey || 'NO CONFIGURADA (VER VAR. ENTORNO)');
    console.log('¡No compartas la VAPID Private Key!');
});

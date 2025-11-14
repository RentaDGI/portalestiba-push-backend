const express = require('express');
const webpush = require('web-push');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 5000; // El puerto 5000 es el valor por defecto si no se especifica en el entorno

// =========================================================================
// ¡¡¡CORRECCIÓN FINAL DE CORS PARA DESARROLLO LOCAL!!!
// Acepta ambos orígenes (localhost y 127.0.0.1) que Live Server puede usar.
// Cuando el frontend esté desplegado, deberás cambiar esto a la URL de tu frontend desplegado.
// =========================================================================
app.use(cors({
    origin: ['http://localhost:8080', 'http://127.0.0.1:8080'], // <--- ¡AQUÍ ESTÁ LA CORRECCIÓN!
    methods: ['GET', 'POST', 'PUT', 'DELETE'], 
    allowedHeaders: ['Content-Type', 'Authorization'] 
}));

app.use(bodyParser.json());

// =========================================================================
// ¡Tus claves VAPID y email se leen AHORA de las variables de entorno!
// (DEBES CONFIGURAR VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY y WEB_PUSH_EMAIL en Vercel!)
// =========================================================================
const vapidKeys = {
    publicKey: process.env.VAPID_PUBLIC_KEY, 
    privateKey: process.env.VAPID_PRIVATE_KEY, 
};

// Verificar que las claves estén disponibles (solo para debug en desarrollo)
if (!vapidKeys.publicKey || !vapidKeys.privateKey) {
    console.error("ERROR: Las claves VAPID (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY) no están configuradas en las variables de entorno.");
    // En un entorno de producción, podrías querer terminar el proceso aquí.
    // process.exit(1); 
}
if (!process.env.WEB_PUSH_EMAIL) {
    console.error("ERROR: El email de Web Push (WEB_PUSH_EMAIL) no está configurado en las variables de entorno.");
    // process.exit(1);
}

webpush.setVapidDetails(
    `mailto:${process.env.WEB_PUSH_EMAIL}`, 
    vapidKeys.publicKey,
    vapidKeys.privateKey
);

// Aquí se guardarán las suscripciones (¡ADVERTENCIA: EN PRODUCCIÓN USA UNA BASE DE DATOS!)
// Para Vercel (serverless), este array se reiniciará con cada nueva invocación de la función,
// por lo que es CRÍTICO que en un entorno real uses una base de datos persistente.
let subscriptions = [];

// ===============================================
// RUTAS DE LA API PARA NOTIFICACIONES PUSH
// ===============================================

// 1. Ruta para guardar la suscripción del usuario (desde el frontend)
app.post('/api/push/subscribe', (req, res) => {
    const subscription = req.body;
    // Evitar duplicados si el usuario se suscribe varias veces
    if (!subscriptions.some(s => s.endpoint === subscription.endpoint)) {
        subscriptions.push(subscription);
        console.log('Nueva suscripción registrada:', subscription.endpoint);
    } else {
        console.log('Suscripción ya existente:', subscription.endpoint);
    }
    res.status(201).json({ message: 'Subscription saved.' });
});

// 2. Ruta para eliminar la suscripción del usuario
app.post('/api/push/unsubscribe', (req, res) => {
    const endpointToRemove = req.body.endpoint;
    const initialLength = subscriptions.length;
    subscriptions = subscriptions.filter(s => s.endpoint !== endpointToRemove);
    if (subscriptions.length < initialLength) {
        console.log('Suscripción eliminada:', endpointToRemove);
    } else {
        console.log('Intento de desuscripción de endpoint no encontrado:', endpointToRemove);
    }
    res.status(200).json({ message: 'Subscription removed.' });
});

// 3. Ruta para ENVIAR una notificación de "Nueva Contratación"
// Esta ruta es la que llamará tu Supabase Edge Function
app.post('/api/push/notify-new-hire', async (req, res) => {
    const { title, body, url } = req.body; 
    
    // Validar que hay suscriptores antes de intentar enviar
    if (subscriptions.length === 0) {
        console.log('No hay suscriptores registrados en este momento para enviar la notificación.');
        return res.status(200).json({ message: 'No active subscriptions to notify.' });
    }

    const payload = JSON.stringify({
        title: title || '¡Nueva Contratación Disponible!',
        body: body || 'Revisa los detalles de la última incorporación a nuestro equipo.',
        url: url || '/', 
    });

    console.log(`Enviando notificación a ${subscriptions.length} suscriptores...`);

    const notificationsPromises = subscriptions.map(async (subscription, index) => {
        try {
            await webpush.sendNotification(subscription, payload);
            console.log(`Notificación enviada a suscriptor ${index + 1}`);
        } catch (error) {
            console.error(`Error enviando notificación a suscriptor ${index + 1} (${subscription.endpoint}):`, error);
            // Si la suscripción falla (ej. usuario desinstaló la PWA, ya no existe, etc.), elimínala
            if (error.statusCode === 410 || error.statusCode === 404) { // Gone: La suscripción no es válida
                console.log(`Suscripción inválida/expirada eliminada: ${subscription.endpoint}`);
                // Marcar para eliminar del array. No podemos modificar el array directamente mientras iteramos con map.
                return { endpoint: subscription.endpoint, status: 'failed', remove: true };
            }
            return { endpoint: subscription.endpoint, status: 'failed', remove: false };
        }
        return { endpoint: subscription.endpoint, status: 'success', remove: false };
    });

    const results = await Promise.all(notificationsPromises);

    // Filtrar suscripciones fallidas que deben ser eliminadas
    subscriptions = subscriptions.filter(s => !results.some(r => r.remove && r.endpoint === s.endpoint));

    console.log(`Finalizado el envío de notificaciones. Suscripciones restantes: ${subscriptions.length}`);
    res.status(200).json({ message: 'Notifications sent.', totalSent: results.filter(r => r.status === 'success').length });
});


app.listen(port, () => {
    console.log(`Backend de notificaciones corriendo en http://localhost:${port}`);
    console.log('VAPID Public Key (para tu frontend):', vapidKeys.publicKey || 'NO CONFIGURADA (VER VAR. ENTORNO)');
    console.log('¡No compartas la VAPID Private Key!');
});

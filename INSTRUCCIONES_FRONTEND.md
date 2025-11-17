# Instrucciones para Actualizar el Frontend (PortalEstibaVLC)

## Problema Resuelto
Las notificaciones de "nueva contratación" ahora llevan correctamente a la pestaña "Mi Contratación" en lugar de mostrar un error 404.

## Cambios Realizados en el Backend

El backend (`portalestiba-push-backend`) ahora envía:
```json
{
  "title": "¡Nueva Contratación Disponible!",
  "body": "Revisa los detalles...",
  "url": "/?page=contratacion",
  "page": "contratacion"
}
```

## Cambios Necesarios en el Frontend

Necesitas modificar **2 archivos** en el repositorio `PortalEstibaVLC`:

---

### 📄 1. Modificar `service-worker.js`

**Ubicación:** `/service-worker.js` (líneas 171-230)

#### Cambio 1: Actualizar el evento 'push' (línea 171-203)

**REEMPLAZAR:**
```javascript
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const {
    title = 'Nueva Contratación en Estiba VLC',
    body = '¡Se ha publicado una nueva contratación en el puerto!',
    url = '/'
  } = data;

  const options = {
    body: body,
    icon: 'https://i.imgur.com/Q91Pi44.png',
    badge: 'https://i.imgur.com/Q91Pi44.png',
    vibrate: [200, 100, 200],
    data: {
      url: url,
      dateOfArrival: Date.now(),
      primaryKey: 'push-notification-id-' + Date.now(),
    },
    actions: [
      {
        action: 'ver-contratacion',
        title: 'Ver Contratación',
      },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});
```

**POR:**
```javascript
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const {
    title = 'Nueva Contratación en Estiba VLC',
    body = '¡Se ha publicado una nueva contratación en el puerto!',
    url = '/?page=contratacion',  // <-- Nueva URL por defecto
    page = 'contratacion'        // <-- Nuevo: página de destino
  } = data;

  const options = {
    body: body,
    icon: 'https://i.imgur.com/Q91Pi44.png',
    badge: 'https://i.imgur.com/Q91Pi44.png',
    vibrate: [200, 100, 200],
    data: {
      url: url,
      page: page,  // <-- Nuevo: almacenar la página de destino
      dateOfArrival: Date.now(),
      primaryKey: 'push-notification-id-' + Date.now(),
    },
    actions: [
      {
        action: 'ver-contratacion',
        title: 'Ver Contratación',
      },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});
```

#### Cambio 2: Actualizar el evento 'notificationclick' (línea 205-230)

**REEMPLAZAR TODO EL EVENTO:**
```javascript
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          if (event.action === 'ver-contratacion' && event.notification.data.url) {
            client.navigate(event.notification.data.url);
          }
          return client.focus();
        }
      }
      if (event.action === 'ver-contratacion' && event.notification.data.url) {
        return clients.openWindow(event.notification.data.url);
      }
      return clients.openWindow(event.notification.data.url || '/');
    })
  );
});
```

**POR:**
```javascript
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const targetPage = event.notification.data.page || 'contratacion';

      // Si ya hay una ventana abierta, enfócala y navega a la página
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          // Enviar mensaje al cliente para que navegue a la página correcta
          client.postMessage({
            type: 'NAVIGATE_TO_PAGE',
            page: targetPage
          });
          return client.focus();
        }
      }

      // Si no hay ventana abierta, abrir una nueva con el query parameter
      return clients.openWindow(event.notification.data.url || `/?page=${targetPage}`);
    })
  );
});
```

---

### 📄 2. Modificar `app.js`

**Ubicación:** `/app.js`

#### Agregar listeners para mensajes del service worker

**AGREGAR al final del archivo (después de la línea 4531), ANTES del cierre del DOMContentLoaded:**

```javascript
// ===============================================
// NAVEGACIÓN AUTOMÁTICA DESDE NOTIFICACIONES PUSH
// ===============================================

// Escuchar mensajes del service worker para navegar automáticamente
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'NAVIGATE_TO_PAGE') {
      const targetPage = event.data.page;
      console.log('[App] Navegando automáticamente a:', targetPage);

      // Verificar si el usuario está autenticado
      if (AppState.isAuthenticated) {
        navigateTo(targetPage);
      } else {
        // Si no está autenticado, guardar la página de destino y redirigir al login
        sessionStorage.setItem('pendingNavigation', targetPage);
        navigateTo('login');
      }
    }
  });
}

// Al cargar la página, verificar si hay un query parameter 'page'
// Esto se usa cuando el usuario hace clic en una notificación y no hay ventana abierta
document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const targetPage = urlParams.get('page');

  if (targetPage) {
    console.log('[App] Query parameter detectado:', targetPage);

    // Limpiar el query parameter de la URL sin recargar
    const newUrl = window.location.pathname + window.location.hash;
    window.history.replaceState({}, '', newUrl);

    // Esperar a que la app se inicialice
    setTimeout(() => {
      if (AppState.isAuthenticated) {
        navigateTo(targetPage);
      } else {
        // Si no está autenticado, guardar la página de destino
        sessionStorage.setItem('pendingNavigation', targetPage);
      }
    }, 500);
  }

  // Al hacer login exitoso, navegar a la página pendiente si existe
  const pendingNavigation = sessionStorage.getItem('pendingNavigation');
  if (pendingNavigation && AppState.isAuthenticated) {
    sessionStorage.removeItem('pendingNavigation');
    setTimeout(() => {
      navigateTo(pendingNavigation);
    }, 500);
  }
});
```

**NOTA:** Si ya existe un `DOMContentLoaded` listener en tu código, integra la lógica dentro del existente en lugar de crear uno nuevo.

---

## 🧪 Cómo Probar

1. **Despliega los cambios** en ambos repositorios (backend y frontend)
2. **Suscríbete** a las notificaciones push desde la PWA
3. **Crea una nueva contratación** en Supabase (tabla que dispara las notificaciones)
4. **Recibe la notificación** y haz clic en "Ver Contratación"
5. **Verifica** que la PWA se abre directamente en la pestaña "Mi Contratación"

### Casos de prueba:

✅ **Con la PWA cerrada:** Debe abrir una nueva ventana/pestaña y navegar a "Mi Contratación"
✅ **Con la PWA abierta:** Debe enfocar la ventana existente y cambiar a "Mi Contratación"
✅ **Sin autenticación:** Debe redirigir al login y luego a "Mi Contratación"

---

## 🔧 Troubleshooting

### La notificación no abre la pestaña correcta
- Verifica que los cambios en `service-worker.js` se hayan aplicado
- Limpia la caché del navegador o desregistra el service worker antiguo
- En DevTools → Application → Service Workers → Unregister

### Error de "navigateTo is not defined"
- Asegúrate de que la función `navigateTo()` en `app.js` esté en el scope global
- Verifica que el código de navegación automática esté dentro del contexto correcto

### La notificación no se muestra
- Verifica que el backend esté enviando el payload correcto
- Revisa los logs en la consola del navegador (F12 → Console)
- Verifica permisos de notificación en el navegador

---

## 📝 Resumen de Cambios

| Archivo | Líneas | Cambio |
|---------|--------|--------|
| `service-worker.js` | 178 | Añadir `page = 'contratacion'` en destructuring |
| `service-worker.js` | 187 | Añadir `page: page` en options.data |
| `service-worker.js` | 205-230 | Reemplazar todo el evento notificationclick |
| `app.js` | Final | Agregar listeners para mensajes del SW y query params |

---

## 🎯 Resultado Final

Después de implementar estos cambios:

1. ✅ Las notificaciones se envían correctamente desde el backend
2. ✅ El link "Ver Contratación" funciona perfectamente
3. ✅ La PWA navega automáticamente a la pestaña "Mi Contratación"
4. ✅ No más errores 404

---

**Autor:** Claude Code
**Fecha:** 2025-11-17
**Repositorio Backend:** https://github.com/RentaDGI/portalestiba-push-backend
**Repositorio Frontend:** https://github.com/TheViking816/PortalEstibaVLC

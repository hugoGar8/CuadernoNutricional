# Sincronizacion gratis con Firebase

La app funciona sin Firebase, pero los datos se quedan en cada dispositivo. Para sincronizar movil, portatil y web, activa Firebase con el plan gratis Spark.

## 1. Crear proyecto

1. Entra en https://console.firebase.google.com/.
2. Crea un proyecto nuevo.
3. Puedes desactivar Google Analytics.

## 2. Crear app web

1. En el panel del proyecto, pulsa el icono Web `</>`.
2. Registra la app.
3. Copia el objeto `firebaseConfig`.
4. Pegalo en `firebase-config.js`.
5. Cambia `enabled: false` por `enabled: true`.

## 3. Activar login anonimo

1. Ve a `Authentication`.
2. En `Sign-in method`, activa `Anonymous`.

## 4. Crear Firestore

1. Ve a `Firestore Database`.
2. Crea una base de datos.
3. Elige la ubicacion que prefieras.
4. En reglas, usa:

```txt
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /cuadernos/{cuadernoId} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## 5. Publicar

Haz commit y push. Al abrir la app en dos dispositivos, cualquier cambio deberia aparecer en ambos.

Si quieres separar varios cuadernos, cambia `notebookId` en `firebase-config.js` por otro nombre.

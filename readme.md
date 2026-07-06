Kiosco Inteligente

Un sistema de gestión de kiosco simple, minimalista y completamente funcional, desarrollado con HTML, CSS y JavaScript ES6, utilizando Firebase Firestore como base de datos. Diseñado para ser rápido, bonito y 100% responsive, ideal para pequeños negocios.

Características

•
Gestión de Productos (CRUD): Registra, edita, elimina y actualiza productos manualmente.

•
Búsqueda Instantánea: Encuentra productos por nombre, código o precio en tiempo real.

•
Escáner de Códigos de Barras: Utiliza la cámara del dispositivo para escanear códigos. Si el producto existe, lo muestra; si no, permite crearlo rápidamente.

•
Sistema de Ventas: Agrega productos al carrito, modifica cantidades, calcula subtotales y totales. Al confirmar la venta, el stock se descuenta automáticamente en Firestore.

•
Registro de Ventas: Todas las ventas se registran en Firestore.

•
Alertas de Stock Mínimo: Notificaciones visuales cuando un producto alcanza un nivel de stock bajo.

•
Interfaz Moderna: Diseño basado en tarjetas, con bordes redondeados, sombras suaves y animaciones discretas. Optimizado para dispositivos móviles.

Estructura del Proyecto

El proyecto se mantiene intencionalmente simple, con un máximo de 5 archivos:

•
index.html: La estructura principal de la aplicación.

•
styles.css: Todos los estilos visuales de la aplicación.

•
app.js: La lógica de JavaScript, incluyendo la interacción con Firebase y el escáner.

•
firebase.js: Configuración e inicialización de Firebase Firestore.

•
README.md: Este archivo.

Configuración de Firebase

Este proyecto utiliza Firebase Firestore para la persistencia de datos. No requiere autenticación de usuarios.

Para que la aplicación funcione, necesitas configurar tu proyecto de Firebase y obtener las credenciales. Sigue estos pasos:

1.
Crea un Proyecto en Firebase: Ve a la Consola de Firebase y crea un nuevo proyecto.

2.
Crea una Aplicación Web: Dentro de tu proyecto, agrega una nueva aplicación web. Firebase te proporcionará un objeto de configuración similar a este:

JavaScript


const firebaseConfig = {
    apiKey: "TU_API_KEY",
    authDomain: "TU_AUTH_DOMAIN",
    projectId: "TU_PROJECT_ID",
    storageBucket: "TU_STORAGE_BUCKET",
    messagingSenderId: "TU_MESSAGING_SENDER_ID",
    appId: "TU_APP_ID"
};





3.
Habilita Firestore: En la sección "Firestore Database" de tu proyecto de Firebase, crea una nueva base de datos en modo de producción (o modo de prueba si estás desarrollando, pero asegúrate de ajustar las reglas de seguridad).

4.
Reglas de Seguridad de Firestore: Para este MVP, puedes usar reglas permisivas (solo para desarrollo, no recomendado para producción sin autenticación):

Plain Text


rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}



¡ADVERTENCIA! Estas reglas permiten acceso público de lectura y escritura a tu base de datos. Para un entorno de producción, deberías implementar reglas de seguridad más estrictas.



Despliegue en Render (Static Sites)

Este proyecto está diseñado para ser desplegado fácilmente como un Static Site en Render. La configuración de Firebase se inyecta directamente en index.html mediante variables de entorno de Render.

1.
Crea un nuevo Static Site en Render: Conecta tu repositorio de GitHub (o GitLab/Bitbucket) donde alojarás este proyecto.

2.
Configura las Variables de Entorno: En la configuración de tu Static Site en Render, añade las siguientes variables de entorno. Render reemplazará automáticamente los marcadores de posición en index.html con estos valores:

Asegúrate de que los nombres de las variables de entorno en Render coincidan exactamente con los marcadores de posición en index.html (e.g., RENDER_FIREBASE_API_KEY se mapea a <!--REPLACE_API_KEY-->).

•
RENDER_FIREBASE_API_KEY

•
RENDER_FIREBASE_AUTH_DOMAIN

•
RENDER_FIREBASE_PROJECT_ID

•
RENDER_FIREBASE_STORAGE_BUCKET

•
RENDER_FIREBASE_MESSAGING_SENDER_ID

•
RENDER_FIREBASE_APP_ID



3.
Configuración de Build & Publish:

•
Build Command: npm install (o déjalo vacío si no tienes dependencias de Node.js, ya que este proyecto no las tiene directamente).

•
Publish Directory: . (el directorio raíz de tu proyecto).



4.
Despliega: Render construirá y desplegará automáticamente tu aplicación. Una vez desplegada, tu Kiosco Inteligente estará accesible a través de la URL proporcionada por Render.

Uso

1.
Navegación: Cambia entre las secciones "Ventas" e "Inventario" usando los botones en la cabecera.

2.
Inventario:

•
Añadir Producto: Haz clic en el botón "Nuevo" para abrir el modal y registrar un nuevo producto.

•
Editar/Eliminar: Usa los iconos de lápiz y papelera en cada tarjeta de producto.

•
Búsqueda: Filtra productos por nombre, código o precio.



3.
Ventas:

•
Añadir al Carrito: Escanea un producto o búscalo por nombre/código en la barra de búsqueda. Si el producto existe, se añade al carrito. Si no, te preguntará si deseas crearlo.

•
Modificar Cantidad: Usa los botones + y - en los ítems del carrito.

•
Finalizar Venta: Haz clic en "Confirmar Venta" para registrar la venta y descontar el stock.



Consideraciones Adicionales

•
Quagga2: La librería Quagga2 se utiliza para el escaneo de códigos de barras. Asegúrate de que tu navegador tenga permisos para acceder a la cámara.

•
Lucide Icons: Se utilizan para los iconos de la interfaz.




© 2026 | Con ❤️ para mamá


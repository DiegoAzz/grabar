# 🎥 Loom Clone - Async Screen & Webcam Video Platform

Un clon completo y de alta fidelidad de **[Loom](https://www.loom.com/)** diseñado para grabar pantalla + cámara web circular flotante, guardar los videos en la nube o localmente, y compartirlos mediante enlaces directos con comentarios y reacciones con emojis.

![Loom UI Clone](https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200&auto=format&fit=crop&q=80)

---

## ✨ Características Principales

### 1. Grabador de Pantalla y Cámara (Widget Flotante idéntico a Loom)
- **Captura Real**: Graba pantalla completa, ventana específica o pestaña actual con `navigator.mediaDevices.getDisplayMedia`.
- **Burbuja de Cámara Circular Flotante**:
  - Transmisión en vivo de tu cámara web en un círculo moderno con aro blanco y sombra suave.
  - **Arrastrable en tiempo real**: Muévela con el ratón a cualquier esquina o posición de la pantalla.
  - Selector de tamaño: Pequeño (120px), Mediano (180px), Grande (260px).
  - Modo espejo y efecto desenfoque (blur).
  - **Composición Real en Video**: Mediante un lienzo Canvas interno de 30 FPS, el video final exportado **contiene tanto la pantalla grabada como la burbuja circular de tu cámara en la posición exacta donde la colocaste**.
- **Visualizador de Audio en Vivo**:
  - Analizador de ondas con Web Audio API (`AnalyserNode`) que reacciona visualmente en tiempo real a la voz del micrófono en el widget.
- **Selector de Dispositivos**:
  - Detección automática de cámaras y micrófonos conectados con menú emergente.
- **Barra de Control Flotante Lateral**:
  - Botón rojo de detener y guardar.
  - Contador de tiempo en vivo.
  - Pausar / Reanudar grabación.
  - Reiniciar desde cero.
  - Cancelar y descartar.
  - Herramienta de dibujo (lápiz para anotar en pantalla mientras grabas).
- **Cuenta regresiva 3.. 2.. 1.. ¡GO!** con sonido y animación antes de iniciar.

### 2. Biblioteca de Videos (Loom Workspace)
- Interfaz moderna estilo Loom con panel lateral ("Samantha's Workspace").
- Pestañas: **Videos**, **Screenshots**, **Archive**.
- Búsqueda instantánea en tiempo real por título o descripción.
- Tarjetas de video con duración, vista previa, autor, vistas, fecha relativa y menú contextual (copiar link, descargar, eliminar).

### 3. Reproductor y Página de Compartir (`/v/:id`)
- **Reproductor HTML5 personalizado**:
  - Control de volumen, barra de progreso con desplazamiento suave.
  - Control de velocidad: 0.8x, 1x, 1.2x, 1.5x, 2x.
  - Modo Picture-in-Picture y Pantalla Completa.
  - Atajos de teclado (Espacio para Play/Pausa, Flechas para avanzar/retroceder 5s).
- **Reacciones con Emojis Interactivas (🔥, 👍, ❤️, 🎉, 🚀)**:
  - Al pulsar una reacción, brotan partículas flotantes animadas sobre el video y se guardan en el servidor.
- **Comentarios con Marca de Tiempo**:
  - Escribe comentarios vinculados al segundo actual del video (ejemplo: `00:24`).
  - Al hacer clic sobre cualquier marca de tiempo de un comentario, el video salta automáticamente a ese instante exacto.
- **Resumen Inteligente y Capítulos**:
  - Pestaña de notas clave y navegación por capítulos.
- **Compartir y Descargar**:
  - Enlace público para compartir con 1 clic.
  - Código iframe de incrustación para insertar en sitios web.
  - Descarga directa del archivo de video (`.webm` / `.mp4`).

### 4. Almacenamiento y Backend
- Servidor Node.js + Express con soporte de streaming parcial `HTTP 206 Partial Content` (permite adelantar o retroceder el video sin esperar a que cargue completo).
- Subida de videos mediante `multer` a la carpeta `uploads/`.
- Respaldo automático en **IndexedDB** en el navegador para garantizar que las grabaciones nunca se pierdan si se va la conexión.

---

## 🚀 Inicio Rápido Local

1. Asegúrate de tener Node.js instalado (v18 o superior).
2. Abre una terminal y navega a la carpeta del proyecto:
   ```bash
   cd c:\REA\loom-clone
   ```
3. Instala las dependencias:
   ```bash
   npm install
   ```
4. Inicia el servidor:
   ```bash
   npm start
   ```
5. Abre en tu navegador:
   👉 **http://localhost:3000**

---

## 🌐 Despliegue Online en la Nube

Consulta el archivo [DEPLOY.md](DEPLOY.md) para instrucciones detalladas paso a paso en:
- **Render.com** (1-click deploy gratuito con HTTPS)
- **Railway.app**
- **Docker / Docker-Compose**
- **Servidores VPS / Nginx**

# 🚀 Guía de Despliegue Online - Loom Clone

Este clon de Loom está 100% optimizado para desplegarse gratis o en producción en la nube con soporte completo para subida de videos, streaming parcial (`HTTP 206 Range`) y almacenamiento persistente.

---

## Opción 1: Despliegue Gratis en Render.com (Recomendado)

1. Sube este proyecto o la carpeta `loom-clone` a un repositorio en **GitHub**.
2. Entra en [Render.com](https://render.com/) e inicia sesión.
3. Haz clic en **New +** y selecciona **Web Service**.
4. Conecta tu repositorio de GitHub.
5. Configura los siguientes campos:
   - **Name**: `loom-clone`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: `Free`
6. (Opcional) En **Disks**, añade un disco persistente montado en `/app/uploads` para que los videos no se borren en reinicios.
7. Haz clic en **Create Web Service**. ¡En 2 minutos tendrás tu URL pública (ejemplo: `https://loom-clone.onrender.com`) lista para grabar y compartir videos!

---

## Opción 2: Despliegue en Railway.app

1. Entra en [Railway.app](https://railway.app/).
2. Haz clic en **New Project** -> **Deploy from GitHub repo**.
3. Selecciona tu repositorio.
4. Railway detectará automáticamente Node.js y ejecutará `npm start`.
5. En la pestaña **Settings**, haz clic en **Generate Domain** para obtener tu enlace público HTTPS.

---

## Opción 3: Despliegue con Docker / Docker Compose

Si tienes un servidor VPS (Ubuntu, Debian, DigitalOcean, Linode, AWS EC2):

```bash
# 1. Clonar o copiar la carpeta loom-clone al servidor
cd loom-clone

# 2. Levantar el contenedor en segundo plano
docker-compose up -d --build

# 3. Comprobar que está funcionando
docker ps
```
La aplicación estará corriendo en `http://tu-ip-o-dominio:3000`.

---

## Opción 4: Ejecución Local en tu Computadora

```bash
# Entrar a la carpeta
cd c:\REA\loom-clone

# Instalar dependencias (ya instaladas)
npm install

# Iniciar el servidor
npm start
```
Abre tu navegador en: **`http://localhost:3000`**

---

## Requisitos de Navegador para Grabar Pantalla y Cámara

- Para que el navegador permita grabar la pantalla (`getDisplayMedia`) y la cámara/micrófono (`getUserMedia`), la aplicación **debe servirse sobre HTTPS** cuando esté montada en internet (Render y Railway proporcionan HTTPS automáticamente sin costo).
- En `localhost` los navegadores permiten permisos de pantalla y cámara sin necesidad de certificado SSL.

# Pádel TV

Módulo de TizenBrew que muestra los directos, próximos torneos y repeticiones de Premier Padel desde Red Bull TV, y los reproduce con el reproductor nativo de la tele. Pensado para Samsung con Tizen 5 (2019), donde la app oficial se queda colgada.

Instalación: en TizenBrew → añadir módulo → `gh/<usuario>/padel-tv`.

Al publicar una versión nueva, renombra `app/index-X.html` y `app/app-X.js` con el nuevo número y actualiza `appPath` en `package.json`: jsDelivr (de donde TizenBrew descarga el módulo) guarda en caché los archivos con el mismo nombre hasta 12 horas.

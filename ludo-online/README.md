# Ludo Matemático Online — V2

## Incluye
- Salas privadas por código.
- 2 a 4 jugadores.
- Turnos y dado controlados por el servidor.
- Movimiento de fichas controlado por el servidor.
- Preguntas matemáticas sincronizadas.
- La respuesta correcta se valida en el servidor.
- Las preguntas personalizadas guardadas en el navegador del creador se envían al servidor al iniciar la sala.
- Imágenes de preguntas incluidas cuando forman parte del banco enviado.
- Modo local conservado.

## Ejecutar
Requiere Node.js 18+.

```bash
npm install
npm start
```

Luego abrir `http://localhost:3000`.

Para jugar desde otros dispositivos, el servidor debe estar publicado en un hosting que soporte Node.js/WebSockets (por ejemplo Render, Railway, Fly.io, VPS, etc.).

## Flujo online
1. El creador selecciona 2–4 jugadores.
2. Escribe su nombre y pulsa Crear sala.
3. Comparte el código.
4. Los demás escriben su nombre y el código y pulsan Unirse.
5. El creador pulsa Iniciar partida.
6. El servidor decide dado, turnos, movimientos y validación de respuestas.

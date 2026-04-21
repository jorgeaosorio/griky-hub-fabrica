# Integración Monday → Griky Hub Fábrica

## Despliegue del Discovery Worker (paso 1 de la integración)

Este Worker es el "portero" entre el Hub y Monday. Su única misión por ahora es **listar todos los boards de `griky-cast.monday.com`** para que decidas cuáles entrarán al Hub.

Setup total: ~25 minutos. Costo: $0.

---

## Resumen visual del flujo

```
[Tu navegador] ──https──> [Cloudflare Worker (portero)] ──https──> [Monday API]
                              ↑                                          ↑
                       Aquí vive el                              Aquí está la
                       MONDAY_TOKEN (oculto)                     data real
```

El navegador nunca toca el token. El Worker lo guarda como variable secreta.

---

## Parte A — Generar el token de Monday (5 min)

1. Entra a `https://griky-cast.monday.com` con tu cuenta de admin.
2. Click en tu **avatar** (esquina superior derecha) → **Developers** → **Developer Center**.
3. En el menú izquierdo: **My Access Tokens**.
4. Click en **Show** (o **Generate** si nunca has creado uno).
5. **Copia el token completo** y guárdalo temporalmente en un lugar seguro (no en un chat ni en un archivo del repo).

Notas importantes:
- El token tiene los permisos de tu usuario. Para reportería de toda la fábrica, úsalo desde una cuenta con visibilidad completa.
- Si en el futuro quieres rotar el token, basta con regenerar y actualizar la variable en Cloudflare.

---

## Parte B — Crear cuenta de Cloudflare y desplegar el Worker (15 min)

### B.1 — Crear cuenta gratuita

1. Ve a `https://dash.cloudflare.com/sign-up`.
2. Regístrate con tu correo de Griky. Verifica el email.
3. Saltea cualquier oferta de plan pagado — el plan **Free** es suficiente.

### B.2 — Crear el Worker

1. En el menú izquierdo del dashboard: **Workers & Pages** → **Create application** → **Create Worker**.
2. Asígnale el nombre: `griky-monday-discovery`.
3. Click en **Deploy** (despliega un "hello world" por defecto, no importa).
4. Una vez desplegado, click en **Edit code** (botón arriba a la derecha).

### B.3 — Pegar el código del Discovery Worker

1. Borra todo el contenido del editor.
2. Abre el archivo `discovery-worker.js` (en esta misma carpeta) y **copia su contenido completo**.
3. Pégalo en el editor de Cloudflare.
4. Click en **Deploy** (esquina superior derecha).
5. Confirma con **Save and deploy**.

### B.4 — Configurar la variable secreta `MONDAY_TOKEN`

1. Vuelve a la pantalla principal del Worker (botón ← arriba a la izquierda).
2. Pestaña **Settings** → sección **Variables and Secrets** → **+ Add**.
3. Llena:
   - **Type**: `Secret` (NO "Text" — secret encripta el valor).
   - **Variable name**: `MONDAY_TOKEN`.
   - **Value**: pega aquí el token de Monday que generaste en la Parte A.
4. Click en **Deploy**.

### B.5 — Probar

1. En la pantalla principal del Worker verás una URL pública del tipo:
   ```
   https://griky-monday-discovery.<tu-subdominio>.workers.dev
   ```
2. Ábrela en tu navegador. Deberías ver un JSON como este:
   ```json
   {
     "ok": true,
     "generated_at": "2026-04-20T17:32:11.482Z",
     "source": "griky-cast.monday.com",
     "total_boards": 27,
     "boards": [
       {
         "id": "1234567890",
         "name": "Producción Video — Cliente X",
         "workspace": "Fábrica de Contenidos",
         "items_count": 142,
         "status_columns": [{ "id": "status", "title": "Estado", "labels": [...] }],
         "date_columns": [...],
         "owners": [{ "name": "PM Ana", "email": "ana@griky.co" }]
       },
       ...
     ]
   }
   ```
3. Si ves `"ok": false` con un mensaje de error, revisa que la variable `MONDAY_TOKEN` esté como **Secret** (no como texto plano) y que esté bien pegada.

---

## Parte C — Visualizar y elegir boards (5 min)

Abre el archivo `viewer-discovery.html` (en esta misma carpeta) en tu navegador.

1. Pega ahí la URL pública de tu Worker (la del paso B.5).
2. Verás todos los boards con un checkbox al lado.
3. Marca los boards que quieres exponer en el Hub.
4. Click en **Exportar selección** → te descarga un JSON con los boards y columnas elegidos.

Ese JSON es el insumo que necesito para construir el siguiente paso: el **Worker de producción** (que ya no lista boards, sino que entrega data formateada para los semáforos del Hub).

---

## Endpoints disponibles en el Discovery Worker

| Endpoint | Para qué sirve |
|---|---|
| `GET /` | Lista todos los boards activos con sus columnas, dueños y workspace |
| `GET /board/:id` | Detalle de un board específico, con muestra de 5 ítems para ver valores reales |
| `GET /health` | Ping de salud — útil para verificar que el Worker está vivo |

---

## ¿Y luego qué? (roadmap de la integración)

1. ✅ **Discovery Worker** — listar boards (este paso).
2. ⏭️ **Production Worker** — endpoint optimizado que entrega solo los datos del Hub: semáforo, fechas clave, carga por PM, ítems por columna.
3. ⏭️ **Módulo JS en el Hub** — consumir el Production Worker y renderizar widgets con la paleta Navy/Coral/Green/Yellow.
4. ⏭️ (Opcional, futuro) **Webhooks** — si más adelante quieres push real, agregamos webhooks de Monday → Worker → cache → Hub.

---

## Seguridad y costos

- El plan Free de Cloudflare Workers permite **100.000 requests/día**. El Hub abierto por 5 PMs hace ~50 requests/día, así que estás holgadísimo.
- El token nunca aparece en el código fuente del Hub ni en el repo. Solo vive como Secret en Cloudflare.
- El Worker tiene CORS abierto (`*`) porque solo entrega data de lectura. Si en el futuro quieres restringirlo a tu dominio del Hub, basta con cambiar `Access-Control-Allow-Origin` en el código.

---

## Troubleshooting

| Síntoma | Causa probable | Solución |
|---|---|---|
| `MONDAY_TOKEN no está configurado` | La variable no se guardó como Secret o no se redesplegó | Repite Parte B.4 y vuelve a hacer Deploy |
| `Monday API error: Unauthorized` | El token está mal copiado o expiró | Regenera en Monday y actualiza la variable |
| `total_boards: 0` | El usuario del token no tiene acceso a los boards | Genera el token con un usuario admin del workspace |
| El viewer no carga nada | URL del Worker mal pegada o sin `https://` | Verifica que la URL inicia con `https://` y termina sin `/` |

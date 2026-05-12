# Actualización del Worker — Production endpoints

Pasamos de **Discovery** (listar boards) a **Production** (data agregada para el Hub).

No vas a borrar ni recrear nada. Es **el mismo Worker, el mismo token**, solo le cambiamos el código por uno más completo.

---

## Pasos (5 minutos)

### 1. Ir al Worker en Cloudflare

- Dashboard de Cloudflare → menú izquierdo **Compute** → **Workers & Pages** → click en `griky-monday-discovery`.
- Arriba a la derecha → **Edit code**.

### 2. Reemplazar el código

- En el editor, **borra todo** (Cmd+A → Backspace).
- Abre el archivo `production-worker.js` (en esta misma carpeta) y **copia todo el contenido**.
- Pega en el editor de Cloudflare.

### 3. Desplegar

- Click en **Deploy** (esquina superior derecha del editor).
- Confirma con **Save and deploy**.
- Espera ~10 segundos a que termine.

### 4. Verificar (en el preview interno del editor)

En el panel **HTTP** a la derecha:
- Method: `GET`
- URL/Path: `/hub`
- Click **Send**

Vas a ver una respuesta tipo:

```json
{
  "ok": true,
  "summary": {
    "total_cursos": 142,
    "total_clientes": 14,
    "total_recursos": 1280,
    "semaforo_global": { "green": 35, "yellow": 60, "red": 22, "gray": 25 }
  },
  "clientes": [
    { "nombre": "Cliente X", "cursos": [...], "agregado": {...} },
    ...
  ],
  "carga_pm": [...],
  "proximas_fechas_cierre": [...],
  "recursos": { "por_produccion": {...}, "por_vertical": {...} },
  "uddi": { "items_count": 25 }
}
```

Si la respuesta tarda 5-15 segundos la primera vez, es normal — está paginando todos los cursos y subelementos.

---

## Endpoints disponibles después del update

| Endpoint | Para qué sirve | Quién lo usa |
|---|---|---|
| `GET /hub` | Payload completo con clientes, semáforo, fechas, carga, recursos, UDDI | El Hub Monday Widget |
| `GET /hub/cursos` | Detalle crudo de cursos de MASTER CONTENIDO | Debug / análisis |
| `GET /hub/recursos` | Detalle crudo de subelementos | Debug / análisis |
| `GET /hub/uddi` | Solo el contador de UDDI | Debug |
| `GET /` | Discovery: lista de los 123 boards (legacy) | Tú, si quieres explorar |
| `GET /board/:id` | Detalle completo de un board específico | Tú, si quieres explorar |
| `GET /health` | Ping de salud | Monitoring |

---

## Ver el Hub funcionando

Una vez actualizado el Worker:

1. Abre el archivo `hub-monday-widget.html` (en esta misma carpeta) en tu navegador.
2. La URL del Worker viene precargada — solo dale **Cargar**.
3. Vas a ver:
   - **4 KPIs principales**: cursos totales, clientes, recursos, UDDI.
   - **Semáforo por cliente**: click en cualquier cliente para expandir y ver sus cursos individuales con su estado, PM, avance %, fecha de cierre y link a Monday.
   - **Próximas fechas de cierre**: top 50, ordenadas por urgencia, con badges de "vencido / en X días".
   - **Carga por PM**: cuántos cursos activos tiene cada PM y cómo se distribuyen en el semáforo.
   - **Recursos por etapa**: cuántos subelementos hay en cada estado de producción.

---

## Mapeo del semáforo (REVISIÓN FINAL CLIENTE)

| Etiqueta en Monday | Semáforo |
|---|---|
| APROBADO | 🟢 Verde |
| EN REVISIÓN CLIENTE | 🟡 Amarillo |
| EN PAUSA | 🟡 Amarillo |
| DEVUELTO PARA AJUSTES | 🔴 Rojo |
| CANCELADO | 🔴 Rojo |
| (cualquier otra / vacío) | ⚪ Gris |

Si quieres cambiar este mapeo, edita la constante `SEMAFORO_MAP` al inicio de `production-worker.js` y vuelve a desplegar.

---

## Cliente

El Worker usa **CLIENTEV3** (texto) como fuente principal. Si está vacío en algún curso, usa el primer ítem enlazado del board_relation **CLIENTE**. Si ambos están vacíos, el curso queda agrupado en "Sin cliente".

Para que la agrupación quede limpia, en Monday asegúrate de que CLIENTEV3 tenga el nombre del cliente para todos los cursos activos.

---

## Próximos pasos opcionales

Cuando esto esté funcionando bien, podemos:

1. **Embeber el widget directamente en el Hub principal** (`griky-fabrica-hub.html`) en vez de tenerlo aparte.
2. **Cachear la respuesta** del `/hub` por 60 segundos para reducir llamadas a Monday cuando el Hub se abre varias veces seguidas.
3. **Agregar webhooks** para push real (apenas cambias algo en Monday, el Hub se entera automáticamente).
4. **Agregar más boards** a la mezcla (ej. el board de Subelementos para sumar recursos por PM).
5. **Restringir CORS** para que solo el dominio del Hub pueda consultar el Worker (más seguro).

---

## Troubleshooting

| Síntoma | Causa | Solución |
|---|---|---|
| `total_cursos: 0` pero el Worker antes funcionaba | El board MASTER CONTENIDO cambió de ID o fue archivado | Revisa el ID `9186901942` en `production-worker.js` (constante `BOARDS.MASTER_CONTENIDO`) |
| `/hub` tarda más de 30 segundos | Tienes muchos cursos+subelementos | Normal en primera consulta; considerar cache (paso 2 de próximos pasos) |
| Widget muestra `Sin cliente` para muchos cursos | CLIENTEV3 está vacío | Llena CLIENTEV3 en Monday o cambia el código para que use solo board_relation |
| Etiquetas raras en el semáforo | Monday usa labels distintas a las del mapeo | Edita `SEMAFORO_MAP` en `production-worker.js` |
| Widget no carga (red) en Chrome | El bug de QUIC que viste antes | Desactiva en `chrome://flags/#enable-quic` o usa Safari |

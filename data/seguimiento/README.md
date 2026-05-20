# `data/seguimiento/`

Estado de ejecución (entregas reales) de cada PM por semana. Vista Director consume este JSON para renderizar las barras apiladas: lo planeado en color claro, lo ejecutado en color sólido.

## Estructura

- `{semana}.json` — una semana, con entregas por PM agrupadas por (bloque, tipo de recurso)
- Las claves de semana usan ISO week: `2026-W21`, `2026-W22`, etc.

## Shape

```json
{
  "semana": "2026-W21",
  "lunes": "2026-05-18",
  "pms": {
    "sophia": {
      "nombre": "Sophia Pacheco",
      "ultimaActualizacion": "2026-05-21T14:30:00Z",
      "entregas": [
        {
          "bloqueIdx": 0,
          "proyId": "esam",
          "proyNombre": "ESAM",
          "curso": "Economía Gerencial",
          "recId": "vid_std",
          "comprometidos": 5,
          "entregados": 3,
          "estado": "parcial",
          "razon": "",
          "actualizadoEn": "2026-05-21T14:30:00Z"
        }
      ]
    }
  }
}
```

### Estados válidos

- `cumplido` — entregado al 100% (entregados = comprometidos)
- `parcial` — entregado parte (0 < entregados < comprometidos)
- `no entregado` — entregados = 0 (suele incluir `razon`)

### Clave única por entrega

`(bloqueIdx, recId)`. Es decir, una entrada por cada (curso, tipo de recurso). El mismo curso puede tener varias entradas (una para `vid_std`, otra para `mul_ris`, etc.) — coherente con el JSON de planeación.

## Flujo de actualización (MVP — sin backend)

1. PM abre Seguimiento (`reporte-semanal-pm-griky.html?pm=sophia`).
2. Si ya hay entregas reportadas de esta semana, el chat las precarga y solo pregunta por las pendientes.
3. PM responde preguntas — cada respuesta se guarda en `localStorage` automáticamente.
4. PM hace clic en **💾 Guardar progreso (.json)** en el header → descarga `2026-W21_sophia.json`.
5. PM envía ese archivo a quien committea (o lo committea él mismo si tiene acceso al repo).
6. Director (o quien sea) hace merge del JSON descargado al `data/seguimiento/2026-W21.json` del repo y pushea.
7. GitHub Pages republic en ~1 min. Vista Director ve el avance en sus barras.

### Merge entre múltiples PMs

Si Sophia descargó su `2026-W21_sophia.json` y Marcela el suyo, hay que mezclarlos en el `2026-W21.json` del repo. Por ahora se hace manual: copiar el bloque `pms.sophia` de un archivo y pegarlo al lado del `pms.marcela` en el archivo destino. Si esto se vuelve frecuente, vale la pena un script `scripts/merge-seguimiento.mjs`.

## Conducta de Vista Director

- Si **no hay JSON de seguimiento** para una semana, las barras solo muestran lo planeado (color claro al ancho completo, capa sólida en 0).
- Si **hay JSON con algunas entregas**, las barras muestran lo proporcional. El badge del PM cambia de `"477 rec"` a `"32 / 477 · 7%"`.
- Vista Director también mezcla `localStorage` del navegador actual como fallback — útil para revisar tu propio progreso antes de pushear.

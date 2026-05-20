# `data/planeaciones/`

Fuente de verdad de las planeaciones semanales de Griky Fábrica.

Las apps **Planeación**, **Vista Director** y **Seguimiento** (`app/*.html`) leen estos archivos por `fetch()` — antes los datos vivían hardcoded en cada HTML.

## Estructura

- `index.json` — manifest de semanas disponibles
- `2026-W{NN}.json` — una semana completa, con todos los PMs activos

### `index.json`

```json
{
  "semanas": [
    { "id": "2026-W21", "lunes": "2026-05-18", "viernes": "2026-05-22", "file": "2026-W21.json" }
  ]
}
```

### `2026-W{NN}.json`

```json
{
  "semana": "2026-W21",
  "lunes": "2026-05-18",
  "viernes": "2026-05-22",
  "pms": {
    "sophia": {
      "nombre": "Sophia Pacheco",
      "objetivo": "",
      "bloques": [
        {
          "id": "pre_sp18_1",
          "proyId": "esam",
          "proyNombre": "ESAM",
          "color": "verde",
          "curso": "Economía Gerencial",
          "up": "",
          "nota": "",
          "counts": { "vid_std": 5, "vid_ava": 5, "mul_ris": 10, ... },
          "total": 40
        }
      ],
      "metas": {
        "ESAM": { "entrega": 5, "aprobar": 0 },
        "UDLA": { "entrega": 0, "aprobar": 14 }
      }
    }
  }
}
```

## Cargar una planeación nueva (flujo recomendado)

1. PM exporta su `.md` desde la app de Planeación y lo guarda en `../../avances/` (al lado del repo).
2. Desde la raíz del repo:
   ```bash
   node scripts/md-to-json.mjs ../avances/planeacion-18-de-may---22-de-may-sophia.md
   ```
   Esto:
   - Detecta PM y semana del .md
   - Crea/actualiza `data/planeaciones/2026-W{NN}.json`
   - Mantiene los otros PMs ya cargados de la misma semana
   - Actualiza `index.json` si la semana es nueva
3. `git add data/planeaciones/ && git commit && git push`
4. GitHub Pages republic en 1-2 min; las tres apps ven los datos nuevos automáticamente.

## PMs activos

| pmKey      | Nombre              |
|------------|---------------------|
| margarita  | Margarita Rosales   |
| sophia     | Sophia Pacheco      |
| marcela    | Marcela Osorio      |
| andres     | Juan Ochoa          |
| jorge      | Jorge Osorio        |
| jean       | Jean Villamizar     |

## Códigos de recursos (`counts`)

| Código    | Tipo                          |
|-----------|-------------------------------|
| `vid_std` | Video estándar                |
| `vid_ava` | Video avatar                  |
| `vid_pod` | Video podcast                 |
| `vid_aud` | Video audiolibro              |
| `vid_int` | Video interactivo             |
| `vid_pre` | Video Premiere                |
| `mul_ris` | Rise                          |
| `mul_inf` | Infografía interactiva        |
| `mul_pre` | Presentación interactiva      |
| `mul_act` | Actividad interactiva         |
| `mul_sto` | Storyline                     |
| `mul_gen` | Genially                      |
| `mul_dis` | Diseño plataforma             |
| `gra_inf` | Infografía estándar           |
| `gra_pdf` | PDF                           |
| `gra_ebo` | Ebook                         |
| `gra_ban` | Banner                        |
| `impl_lms`| Disponibilización LMS         |

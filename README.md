# Griky Fabrica de Contenidos

Sistema operativo para la gestion de produccion de contenido e-learning en Griky S.A.S.

## Que es

Un conjunto de aplicaciones HTML standalone que permiten planificar, ejecutar y monitorear la produccion semanal de recursos digitales (video, multimedia, grafico) para proyectos e-learning.

## Arquitectura

```
PM abre Ficha ──> localStorage ──> Planeacion lee Ficha
       │                                 │
       │                                 ▼
       │                          Seguimiento (viernes)
       │                                 │
       ▼                                 ▼
   Dashboard <──── Hub ◄──── Consolidacion (lunes)
```

Las apps se comunican via `localStorage` del navegador. No requieren servidor, base de datos ni instalacion.

## Apps

| Archivo | Funcion | Quien lo usa |
|---|---|---|
| `app/griky-fabrica-hub.html` | Hub central. Perfil, sincronizacion, consolidado de direccion | Director y PMs |
| `app/griky-dashboard.html` | Dashboard visual de todos los proyectos por PM | Director |
| `app/griky-ficha-proyecto.html` | Ficha de proyecto (una vez por proyecto) | PM |
| `app/griky-planeacion-semanal.html` | Planeacion semanal de recursos por bloque | PM |
| `app/reporte-semanal-pm-griky.html` | Seguimiento semanal (viernes) | PM |
| `app/planeacion-piloto.html` | Version simplificada de planeacion para pilotos | PM |

## Modelo de Horas/Hombre

- Jornada legal Colombia: 46 h/semana
- Eficiencia estandar: 75%
- **Horas productivas por persona: 34.5 h/semana**

Cada tipo de recurso tiene un tiempo estandar de produccion (h/h). El sistema calcula automaticamente personas necesarias por area.

## Verticales de produccion

| Vertical | Tipos de recurso |
|---|---|
| **Video** | Webinar, estandar, avatar, podcast, audiolibro, pixar, basico, interactivo |
| **Multimedia** | Storyline, Rise, presentacion interactiva, infografia interactiva, actividad interactiva, video storyline, video genially, diseno en plataforma |
| **Grafico** | Infografia estandar, PDF, ebook, banner, presentacion estandar |

## Flujo operativo semanal

1. **Ficha de Proyecto** (una vez) — El PM define cliente, cursos, unidades, recursos y ritmo
2. **Planeacion Semanal** (lunes) — El PM planea que recursos producir esta semana
3. **Seguimiento Semanal** (viernes) — El PM reporta que entrego vs que planeo
4. **Consolidacion** (lunes automatico) — Se genera reporte ejecutivo para Direccion

## Estructura del repositorio

```
griky-fabrica/
├── app/                 # Aplicaciones HTML (el producto)
├── configs/             # Configuracion de PMs y equipos
├── prompts/             # Prompts para automatizacion con IA
├── data/                # Datos generados (local, no se commitea)
├── reportes/            # Reportes generados (local, no se commitea)
└── planeaciones/        # Planeaciones llenas (local, no se commitea)
```

## Como usar

1. Clona el repositorio
2. Abre `app/griky-fabrica-hub.html` en tu navegador
3. Configura tu perfil (nombre, rol, equipo dedicado)
4. Navega a las demas apps desde el Hub

No se requiere servidor, npm, ni dependencias. Solo un navegador moderno.

## Stack

- HTML5 + CSS3 + JavaScript vanilla
- localStorage como capa de persistencia
- Chart.js (CDN) para visualizaciones
- Google Fonts Roboto (CDN)
- Zero dependencias locales

## Brand

| Token | Valor |
|---|---|
| Navy | `#22304C` |
| Coral | `#FF2D55` |
| Green | `#2BC168` |
| Yellow | `#F5A623` |
| Font | Roboto |

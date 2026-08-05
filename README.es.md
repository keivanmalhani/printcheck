# printcheck

[![CI](https://github.com/keivanmalhani/printcheck/actions/workflows/ci.yml/badge.svg)](https://github.com/keivanmalhani/printcheck/actions/workflows/ci.yml)
![Licencia MIT](https://img.shields.io/badge/license-MIT-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)

[English](README.md) | Espanol

**[Pruebalo en vivo](https://keivanmalhani.github.io/printcheck/)** - suelta un STL y obten respuestas.

![Demo de printcheck: suelta un STL, ve voladizos y paredes delgadas sobre el modelo, aplica una mejor orientacion](docs/demo.gif)

Este STL, se puede imprimir? Arrastra uno a la pagina y compruebalo: las caras en voladizo brillan en rojo, las paredes delgadas en ambar, los bordes abiertos en cian, y el panel te dice si cabe en tu impresora, si la malla es hermetica y hacia donde voltearla para gastar menos soporte. Todo corre en tu navegador. El archivo nunca sale de la pestana.

## Que revisa

| Revision | Como | Se muestra como |
| --- | --- | --- |
| Ajuste a la cama | caja delimitadora contra presets de impresora, rotacion de huella permitida | chip pasa/falla con el exceso por eje en mm |
| Hermeticidad | cada arista debe compartirse por exactamente dos triangulos | conteo de aristas abiertas y no-manifold, contornos cian sobre el modelo |
| Voladizos | angulo de cara contra la direccion de impresion, umbral deslizable (45 grados por defecto), caras en contacto con la cama exentas | caras rojas, porcentaje del area superficial |
| Paredes delgadas | rayos muestreados hacia adentro contra una rejilla espacial (0.8 mm por defecto, deslizable) | caras ambar, etiquetado como heuristica muestreada |
| Orientacion | las 24 rotaciones alineadas a ejes, puntuadas por area de voladizo con el ajuste a la cama como restriccion dura | botones de un clic con el delta de voladizo |
| Estadisticas | dimensiones, conteo de triangulos, volumen por tetraedros con signo, peso en PLA solido | panel del modelo |

El parser de STL esta escrito desde cero, binario y ASCII, e ignora las normales guardadas para recalcularlas del orden de vertices, porque los exportadores mienten. Los archivos que empiezan con "solid" pero son binarios en secreto se leen bien.

## Privacidad

La linea del pie de pagina es la restriccion de diseno: **tu archivo nunca sale de esta pagina, no hay servidor.** Sin subidas, sin cuentas, sin analitica, sin CDN de terceros en tiempo de ejecucion, y una etiqueta CSP que lo garantiza. Hosting estatico en GitHub Pages.

## Correlo local

Requiere Node 20+.

```bash
git clone https://github.com/keivanmalhani/printcheck.git
cd printcheck
npm install
npm run dev
```

## Desarrollo

El nucleo geometrico (`src/core/`) es TypeScript puro sin un solo import de Three.js: parseo, topologia, voladizos, muestreo de paredes delgadas, ajuste a la cama y puntuacion de orientaciones son funciones planas sobre arreglos tipados, y eso es lo que permite probarlas sin GPU.

```bash
npm test          # vitest sobre el nucleo geometrico
npm run build     # verificacion de tipos mas build de produccion
```

Regenerar las capturas del README desde la app compilada:

```bash
node scripts/screenshots.mjs
```

## Limitaciones honestas

- La revision de paredes delgadas muestrea hasta 3,000 caras. Un pase limpio significa que no se encontro nada delgado entre las muestras, no una prueba.
- El volumen y el peso asumen una pieza solida; el relleno de tu slicer imprimira mas ligero.
- El consejo de orientacion solo considera los 24 volteos alineados a ejes, lo que probarias a mano en un slicer. No genera soportes ni rebana nada.
- Solo deteccion, nunca reparacion: printcheck reporta hoyos, no los parcha.

## Hoja de ruta

- Mover el analisis a un web worker para mallas muy grandes
- Entrada 3MF y OBJ
- Estimado de volumen de soporte por region
- Enlace compartible del veredicto (siempre sin servidor: codificado en la URL)

## Licencia

MIT, ver [LICENSE](LICENSE).

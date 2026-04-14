# Leaflet.Canvas-Flowmap-Layer

The `Leaflet.Canvas-Flowmap-Layer` is a custom layer plugin for [LeafletJS](http://leafletjs.com/) to map the flow of objects from an origin point to a destination point by using a Bezier curve. GeoJSON point feature coordinates are translated to pixel space so that rendering for the points and curves are mapped to an [HTMLCanvasElement](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement).

## Installation

```sh
npm install leaflet-canvas-flowmap-layer
```

`leaflet` is a peer dependency (>=1.7.0) — install it separately if you haven't already. Animation via [tween.js](https://github.com/tweenjs/tween.js) is **bundled in** and requires no separate installation.

## Quickstart

**ESM (recommended):**

```js
import { CanvasFlowmapLayer } from 'leaflet-canvas-flowmap-layer';

const layer = new CanvasFlowmapLayer(geoJsonFeatureCollection, {
  originAndDestinationFieldIds: {
    originUniqueIdField: 'origin_id',
    originGeometry: { x: 'origin_lon', y: 'origin_lat' },
    destinationUniqueIdField: 'destination_id',
    destinationGeometry: { x: 'destination_lon', y: 'destination_lat' },
  },
  pathDisplayMode: 'selection',
  animationStarted: true,
  animationDuration: 2000,
}).addTo(map);

layer.on('click', (e) => {
  if (e.sharedOriginFeatures.length) {
    layer.selectFeaturesForPathDisplay(e.sharedOriginFeatures, 'SELECTION_NEW');
  }
});
```

**Script tag (UMD):**

```html
<script src="https://unpkg.com/leaflet/dist/leaflet.js"></script>
<script src="https://unpkg.com/leaflet-canvas-flowmap-layer/dist/canvas-flowmap-layer.umd.cjs"></script>
<script>
  const { CanvasFlowmapLayer } = window.LeafletCanvasFlowmapLayer;
  const layer = new CanvasFlowmapLayer(geoJsonFeatureCollection, { ... }).addTo(map);
</script>
```

**Demos:**

- [Simple](https://jwasilgeo.github.io/Leaflet.Canvas-Flowmap-Layer/docs/main)
- [Feature comparison](https://jwasilgeo.github.io/Leaflet.Canvas-Flowmap-Layer/docs/comparison) (aka: kitchen sink, sandbox)
- [Advanced symbology: class breaks of flowlines](https://jwasilgeo.github.io/Leaflet.Canvas-Flowmap-Layer/docs/class-breaks-symbology)

**Important!**

This is a LeafletJS port of [sarahbellum/Canvas-Flowmap-Layer](https://www.github.com/sarahbellum/Canvas-Flowmap-Layer), which was originally written for the ArcGIS API for JavaScript. Go there to learn more!

View our [**presentation at NACIS 2017**](https://www.youtube.com/watch?v=cRPx-BfBtv0).

**Table of Contents:**

- [Purpose and Background](#purpose-and-background)
- [Options and More Information for Developers](#options-and-more-information-for-developers)
  - [Data Relationships](#data-relationships)
  - [Animation](#animation)
  - [Interaction](#interaction)
  - [Symbology](#symbology)
- [API](#api)
  - [Constructor Summary](#constructor-summary)
  - [Options and Property Summary](#options-and-property-summary)
  - [Method Summary](#method-summary)
  - [Event Summary](#event-summary)
- [Licensing](#licensing)

[![screenshot](https://raw.githubusercontent.com/jwasilgeo/Leaflet.Canvas-Flowmap-Layer/master/img/img_01.png)](https://jwasilgeo.github.io/Leaflet.Canvas-Flowmap-Layer/docs/main)

## Purpose and Background

Please see [sarahbellum/Canvas-Flowmap-Layer#purpose](https://github.com/sarahbellum/Canvas-Flowmap-Layer#purpose) for more detailed information.

## Options and More Information for Developers

### Data Relationships

"One-to-many", "many-to-one" and "one-to-one" origin-to-destination relationships are supported by this custom layer.

**Important:** The developer must format and provide a GeoJSON point feature collection in a specific format. This layer expects that _both_ origin and destination attributes and spatial coordinates are available in each GeoJSON point feature's properties.

Example of a single GeoJSON point feature within a feature collection that includes _both_ origin and destination info:

```json
{
  "type": "Feature",
  "geometry": {
    "type": "Point",
    "coordinates":[109.6091129, 23.09653465]
  },
  "properties": {
    "origin_id": 238,
    "origin_city": "Hechi",
    "origin_country": "China",
    "origin_lon": 109.6091129,
    "origin_lat": 23.09653465,
    "destination_id": 1,
    "destination_city": "Sarh",
    "destination_country": "Chad",
    "destination_lon": 18.39002966,
    "destination_lat": 9.149969909
  }
}
```

Please see [sarahbellum/Canvas-Flowmap-Layer#data-relationships](https://github.com/sarahbellum/Canvas-Flowmap-Layer#data-relationships) for more details.

### Animation

The animations rely on the [tween.js library](https://github.com/tweenjs/tween.js) to assist with changing the underlying line property values as well as providing many different easing functions and durations. See the `setAnimationDuration()` and `setAnimationEasing()` method descriptions below for more information.

tween.js is **bundled into this package** — no separate script tag or install needed.

### Interaction

You can change how users interact with the `Leaflet.CanvasFlowmapLayer` by controlling which Bezier curves appear and disappear at any time. The demos we provide show how to do this in several ways with LeafletJS `click` and `mouseover` events, coupled with using this layer's `selectFeaturesForPathDisplay()` method.

For example, you could listen for a `click` event on an origin point feature—which is displayed on the map as an `L.CircleMarker`—and then choose to either **add** to your selection of displayed Bezier curves, **subtract** from your selection, or establish a brand **new** selection.

Alternatively, you could set the `pathDisplayMode` option to `'all'` when constructing the layer to display every Bezier curve at once.

### Symbology

The `Leaflet.Canvas-Flowmap-Layer` has default symbol styles established for origin and destination point `L.CircleMarker`s, canvas Bezier curves, and animated canvas Bezier curves.

The default symbol styles for **origin and destination point** `L.CircleMarker`s can be changed by using the layer constructor option `style()` method, since this layer extends from `L.GeoJSON`.

The default symbol styles for **canvas Bezier paths and animations** can be changed by overriding the layer constructor options for `canvasBezierStyle` and `animatedCanvasBezierStyle`, specifically using HTMLCanvasElement stroke and line style property names (instead of LeafletJS marker style properties).

The caveat here is that this Leaflet version of the Canvas-Flowmap-Layer **and** the [Esri-compatible Canvas-Flowmap-Layer](https://github.com/sarahbellum/Canvas-Flowmap-Layer) both rely on symbol configurations that are defined using property objects inspired by the ArcGIS REST API renderer objects specification. Simple, unique value, and class breaks are all supported but instead use canvas stroke and line style property names. Specifically for this, read about the [ArcGIS REST API renderer objects specification](http://resources.arcgis.com/en/help/arcgis-rest-api/#/Renderer_objects/02r30000019t000000/).

See the developer API section below and also [sarahbellum/Canvas-Flowmap-Layer#symbology](https://github.com/sarahbellum/Canvas-Flowmap-Layer#symbology) for more details. We have provided a demo page of how to set class breaks symbology for Bezier curves.

## API

This extends the LeafletJS [`GeoJSON` layer](http://leafletjs.com/reference.html#geojson) and is compatible with Leaflet >=1.7. All properties, methods, and events provided by the `GeoJSON` layer are available in `CanvasFlowmapLayer`, with additional custom features described below.

### Constructor Summary

```javascript
import { CanvasFlowmapLayer } from 'leaflet-canvas-flowmap-layer';

const geoJsonFeatureCollection = {
  // collection of GeoJSON point features
  // with origin and destination attribute properties
  // see discussion above, demos, and CSV example data sources
};

const exampleFlowmapLayer = new CanvasFlowmapLayer(geoJsonFeatureCollection, {
  // required: informs the layer of your data's field names
  originAndDestinationFieldIds: {
    // all kinds of important stuff here — see docs below
    // not required if your data already matches the layer's default field names
  },

  // some custom options
  pathDisplayMode: 'selection',
  animationStarted: true,
  animationEasingFamily: 'Cubic',
  animationEasingType: 'In',
  animationDuration: 2000
}).addTo(map);
```

### Options and Property Summary

| Property | Description |
| --- | --- |
| `originAndDestinationFieldIds` | **Required if your data does not have the same property field names as the layer source code.** `Object`. This object informs the layer of your unique origin and destination attributes (fields). Both origins and destinations need to have their own unique ID attribute and geometry definition. [See example below](#originanddestinationfieldids-example) which includes minimum required object properties. |
| `style` | _Optional_. `Function`. This function defines the symbol style properties of the origin and destination `L.CircleMarker`. [See example below](#style-example). |
| `canvasBezierStyle` | _Optional_. `Object`. This object defines the symbol properties of the non-animated Bezier curve that is drawn on the canvas connecting an origin point to a destination point. [See Symbology discussion above](#symbology). |
| `animatedCanvasBezierStyle` | _Optional_. `Object`. This defines the symbol properties of the animated Bezier curve that is drawn on the canvas directly on top of the non-animated Bezier curve. [See Symbology discussion above](#symbology). |
| `pathDisplayMode` | _Optional_. `String`. Valid values: `'selection'` or `'all'`. Defaults to `'all'`. |
| `wrapAroundCanvas` | _Optional_. `Boolean`. Defaults to `true`. Ensures that canvas features will be drawn beyond +/-180 longitude. |
| `animationStarted` | _Optional_. `Boolean`. Defaults to `false`. This can be set during construction, but you should use the `playAnimation()` and `stopAnimation()` methods to control animations after layer construction. |
| `animationDuration` | See `setAnimationDuration()` method description below. |
| `animationEasingFamily` | See `setAnimationEasing()` method description below. |
| `animationEasingType` | See `setAnimationEasing()` method description below. |

**`originAndDestinationFieldIds` example:**

(This is also the default in the layer source code.)

```javascript
// this is only a default option example,
// developers will most likely need to provide this
// options object with values unique to their data
originAndDestinationFieldIds: {
  originUniqueIdField: 'origin_id',
  originGeometry: {
    x: 'origin_lon',
    y: 'origin_lat'
  },
  destinationUniqueIdField: 'destination_id',
  destinationGeometry: {
    x: 'destination_lon',
    y: 'destination_lat'
  }
}
```

**`style` example:**

(This is also the default in the layer source code.)

```javascript
style: function(geoJsonFeature) {
  // use leaflet's path styling options

  // since the GeoJSON feature properties are modified by the layer,
  // developers can rely on the "isOrigin" property to set different
  // symbols for origin vs destination CircleMarker stylings

  if (geoJsonFeature.properties.isOrigin) {
    return {
      renderer: canvasRenderer, // recommended to use your own L.canvas()
      radius: 5,
      weight: 1,
      color: 'rgb(195, 255, 62)',
      fillColor: 'rgba(195, 255, 62, 0.6)',
      fillOpacity: 0.6
    };
  } else {
    return {
      renderer: canvasRenderer,
      radius: 2.5,
      weight: 0.25,
      color: 'rgb(17, 142, 170)',
      fillColor: 'rgb(17, 142, 170)',
      fillOpacity: 0.7
    };
  }
}
```

### Method Summary

| Method | Arguments | Description |
| --- | --- | --- |
| `selectFeaturesForPathDisplay( selectionFeatures, selectionMode )`  | `selectionFeatures`: `Array` of origin or destination features already managed and displayed by the layer. <br/> <br/> `selectionMode`: `String`. Valid values: `'SELECTION_NEW'`, `'SELECTION_ADD'`, or `'SELECTION_SUBTRACT'`. | This informs the layer which Bezier curves should be drawn on the map. <br/><br/> For example, you can most easily use this in conjunction with a `click` or `mouseover` event listener. |
| `selectFeaturesForPathDisplayById( uniqueOriginOrDestinationIdField, idValue, originBoolean, selectionMode )` |  | This is a convenience method if the unique origin or destination ID value is already known and you do not wish to rely on a `click` or `mouseover` event listener. |
| `selectAllFeaturesForPathDisplay()` |  | This informs the layer to select (and thus show) all Bezier curves. |
| `clearAllPathSelections()` |  | This informs the layer to unselect (and thus hide) all Bezier curves. |
| `playAnimation()` |  | This starts and shows Bezier curve animations. |
| `stopAnimation()` |  | This stops and hides any Bezier curve animations. |
| `setAnimationDuration( duration )` | `duration`: _Optional_. `Number` in milliseconds. | This changes the animation duration. |
| `setAnimationEasing( easingFamily, easingType )` | `easingFamily`: `String`. <br/><br/> `easingType`: `String`. <br/><br/> See `getAnimationEasingOptions()` method for info on valid values. | This changes the animation easing function with the help of the [tween.js library](https://github.com/tweenjs/tween.js). |
| `getAnimationEasingOptions()` |  | Returns information on valid `easingFamily` and `easingType` values based on the [tween.js library](https://github.com/tweenjs/tween.js). |

### Event Summary

| Event | Description |
| --- | --- |
| `click` | Extends [layer `click`](http://leafletjs.com/reference-1.3.0.html#interactive-layer-click) and adds the following properties to the event object: <br/><br/> `isOriginFeature`: `true` if an origin point has been clicked, but `false` if a destination point has been clicked. <br/><br/> `sharedOriginFeatures`: `Array` of features that share the same origin. <br/><br/> `sharedDestinationFeatures`: `Array` of features that share the same destination. |
| `mouseover` | Extends [layer `mouseover`](http://leafletjs.com/reference-1.3.0.html#interactive-layer-mouseover) and adds the following properties to the event object: <br/><br/> `isOriginFeature`: `true` when the mouse first entered an origin point, but `false` when the mouse first entered a destination point. <br/><br/> `sharedOriginFeatures`: `Array` of features that share the same origin. <br/><br/> `sharedDestinationFeatures`: `Array` of features that share the same destination. |

## Upgrading from v1

v2 is a full rewrite in TypeScript and ships as a proper npm package. Breaking changes:

| v1 | v2 |
|---|---|
| `L.canvasFlowmapLayer(geoJson, opts)` | `new CanvasFlowmapLayer(geoJson, opts)` (named import) |
| `window.L.CanvasFlowmapLayer` | `import { CanvasFlowmapLayer } from 'leaflet-canvas-flowmap-layer'` |
| Script tag attaches to `window.L` | UMD global is `window.LeafletCanvasFlowmapLayer.CanvasFlowmapLayer` |
| Must load `tween.js` separately | tween.js is bundled — remove the separate `<script>` tag |

All public methods, options, and events are unchanged.

## Licensing

A copy of the license is available in the repository's [LICENSE](./LICENSE) file.

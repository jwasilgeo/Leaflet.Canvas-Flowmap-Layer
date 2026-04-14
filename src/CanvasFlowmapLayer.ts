import { GeoJSON, Canvas, CircleMarker, LatLng, DomUtil, Util } from 'leaflet';
import type { Map as LeafletMap, GeoJSONOptions, PathOptions, CircleMarkerOptions, LeafletEvent, Layer } from 'leaflet';
import type { Feature, FeatureCollection } from 'geojson';
import * as TWEEN from '@tweenjs/tween.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface GeometryFieldIds {
  x: string;
  y: string;
}

export interface OriginAndDestinationFieldIds {
  originUniqueIdField: string;
  originGeometry: GeometryFieldIds;
  destinationUniqueIdField: string;
  destinationGeometry: GeometryFieldIds;
}

export interface CanvasLineSymbol {
  strokeStyle: string;
  lineWidth: number;
  lineCap: CanvasLineCap;
  shadowColor: string;
  shadowBlur: number;
  /** Only used for animated bezier style. Controls the moving dash segment size. */
  lineDashOffsetSize?: number;
}

export type CanvasBezierStyle =
  | {
      type: 'simple';
      symbol: CanvasLineSymbol;
    }
  | {
      type: 'uniqueValue';
      field: string;
      uniqueValueInfos: Array<{ value: unknown; symbol: CanvasLineSymbol }>;
    }
  | {
      type: 'classBreaks';
      field: string;
      classBreakInfos: Array<{
        classMinValue: number;
        classMaxValue: number;
        symbol: CanvasLineSymbol;
      }>;
      defaultSymbol: CanvasLineSymbol;
    };

export type SelectionMode = 'SELECTION_NEW' | 'SELECTION_ADD' | 'SELECTION_SUBTRACT';

export interface CanvasFlowmapLayerOptions extends GeoJSONOptions {
  originAndDestinationFieldIds: OriginAndDestinationFieldIds;
  canvasBezierStyle: CanvasBezierStyle;
  animatedCanvasBezierStyle: CanvasBezierStyle;
  /** 'all' draws all paths immediately. 'selection' only draws paths for selected features. */
  pathDisplayMode: 'all' | 'selection';
  wrapAroundCanvas: boolean;
  animationStarted: boolean;
  animationEasingFamily: string;
  animationEasingType: string;
  animationDuration: number;
}

/** Extended Leaflet mouse event emitted by CanvasFlowmapLayer click/mouseover. */
export interface CanvasFlowmapLayerMouseEvent {
  isOriginFeature: boolean;
  sharedOriginFeatures: Feature[];
  sharedDestinationFeatures: Feature[];
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface AnimationPropertiesStatic {
  offset: number;
  resetOffset: number;
  repeat: number;
  yoyo: boolean;
}

interface AnimationEasingInfo {
  easingFamily: string;
  easingType: string;
  tweenEasingFunction: (t: number) => number;
}

// Cast Easing to allow dynamic string-key access
type EasingRecord = Record<string, Record<string, (t: number) => number>>;

// ---------------------------------------------------------------------------
// Module-level shared canvas renderer
// ---------------------------------------------------------------------------

const canvasRenderer = new Canvas();

// ---------------------------------------------------------------------------
// Default options
// ---------------------------------------------------------------------------

const DEFAULT_OPTIONS: CanvasFlowmapLayerOptions = {
  // Developers will most likely provide their own originAndDestinationFieldIds
  originAndDestinationFieldIds: {
    originUniqueIdField: 'origin_id',
    originGeometry: { x: 'origin_lon', y: 'origin_lat' },
    destinationUniqueIdField: 'destination_id',
    destinationGeometry: { x: 'destination_lon', y: 'destination_lat' },
  },

  canvasBezierStyle: {
    type: 'simple',
    symbol: {
      strokeStyle: 'rgba(255, 0, 51, 0.8)',
      lineWidth: 0.75,
      lineCap: 'round',
      shadowColor: 'rgb(255, 0, 51)',
      shadowBlur: 1.5,
    },
  },

  animatedCanvasBezierStyle: {
    type: 'simple',
    symbol: {
      strokeStyle: 'rgb(255, 46, 88)',
      lineWidth: 1.25,
      lineDashOffsetSize: 4,
      lineCap: 'round',
      shadowColor: 'rgb(255, 0, 51)',
      shadowBlur: 2,
    },
  },

  pathDisplayMode: 'all',
  wrapAroundCanvas: true,
  animationStarted: false,
  animationEasingFamily: 'Cubic',
  animationEasingType: 'In',
  animationDuration: 2000,

  pointToLayer: (_feature: Feature, latlng: LatLng): Layer => new CircleMarker(latlng, {}),

  style: (feature?: Feature): PathOptions => {
    // CircleMarkerOptions extends PathOptions and adds `radius`; cast is intentional
    if (feature?.properties?.['isOrigin']) {
      return {
        renderer: canvasRenderer,
        radius: 5,
        weight: 1,
        color: 'rgb(195, 255, 62)',
        fillColor: 'rgba(195, 255, 62, 0.6)',
        fillOpacity: 0.6,
      } as PathOptions;
    }
    return {
      renderer: canvasRenderer,
      radius: 2.5,
      weight: 0.25,
      color: 'rgb(17, 142, 170)',
      fillColor: 'rgb(17, 142, 170)',
      fillOpacity: 0.7,
    } as PathOptions;
  },
};

// ---------------------------------------------------------------------------
// CanvasFlowmapLayer
// ---------------------------------------------------------------------------

export class CanvasFlowmapLayer extends GeoJSON {
  declare options: CanvasFlowmapLayerOptions;

  /** All origin and destination GeoJSON features, including duplicates, for internal use. */
  originAndDestinationGeoJsonPoints?: FeatureCollection;

  private _canvasElement!: HTMLCanvasElement;
  private _animationCanvasElement!: HTMLCanvasElement;
  private _customCanvases: HTMLCanvasElement[] = [];
  private _animationFrameId?: number;
  private _animationTween?: TWEEN.Tween<AnimationPropertiesStatic>;
  private _animationPropertiesStatic: AnimationPropertiesStatic = {
    offset: 0,
    resetOffset: 200,
    repeat: Infinity,
    yoyo: false,
  };
  private _animationPropertiesDynamic: {
    duration: number | null;
    easingInfo: AnimationEasingInfo | null;
  } = {
    duration: null,
    easingInfo: null,
  };

  constructor(geoJson: FeatureCollection, options?: Partial<CanvasFlowmapLayerOptions>) {
    // Call parent constructor without geoJson — we handle data loading ourselves
    // after merging options so that pointToLayer/style defaults are in place.
    super(undefined as unknown as FeatureCollection, undefined);

    // Merge defaults, then user-provided options
    Util.setOptions(this, DEFAULT_OPTIONS);
    if (options) {
      Util.setOptions(this, options);
    }

    this._animationPropertiesStatic = { offset: 0, resetOffset: 200, repeat: Infinity, yoyo: false };
    this._animationPropertiesDynamic = { duration: null, easingInfo: null };

    if (geoJson && this.options.originAndDestinationFieldIds) {
      this.setOriginAndDestinationGeoJsonPoints(geoJson);
    }

    // Set up TWEEN animation
    this.setAnimationDuration(this.options.animationDuration);
    this.setAnimationEasing(this.options.animationEasingFamily, this.options.animationEasingType);

    this._animationTween = new TWEEN.Tween(this._animationPropertiesStatic)
      .to({ offset: this._animationPropertiesStatic.resetOffset }, this._animationPropertiesDynamic.duration ?? this.options.animationDuration)
      .easing(this._animationPropertiesDynamic.easingInfo?.tweenEasingFunction ?? TWEEN.Easing.Linear.None)
      .repeat(this._animationPropertiesStatic.repeat)
      .yoyo(this._animationPropertiesStatic.yoyo)
      .start();
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  setOriginAndDestinationGeoJsonPoints(geoJsonFeatureCollection: FeatureCollection): this {
    if (!geoJsonFeatureCollection.features) {
      this.originAndDestinationGeoJsonPoints = undefined;
      return this;
    }

    const configOriginGeometry = this.options.originAndDestinationFieldIds.originGeometry;
    const configDestinationGeometry = this.options.originAndDestinationFieldIds.destinationGeometry;

    geoJsonFeatureCollection.features.forEach((feature, index) => {
      if (feature.type === 'Feature' && feature.geometry?.type === 'Point') {
        // Mutate origin feature
        feature.properties ??= {};
        feature.properties['isOrigin'] = true;
        feature.properties['_isSelectedForPathDisplay'] = this.options.pathDisplayMode === 'all';
        feature.properties['_uniqueId'] = `${index}_origin`;

        (feature.geometry as { coordinates: number[] }).coordinates = [
          feature.properties[configOriginGeometry.x] as number,
          feature.properties[configOriginGeometry.y] as number,
        ];

        // Clone for destination
        const destinationFeature: Feature = JSON.parse(JSON.stringify(feature)) as Feature;
        destinationFeature.properties!['isOrigin'] = false;
        destinationFeature.properties!['_isSelectedForPathDisplay'] = false;
        destinationFeature.properties!['_uniqueId'] = `${index}_destination`;

        (destinationFeature.geometry as { coordinates: number[] }).coordinates = [
          destinationFeature.properties![configDestinationGeometry.x] as number,
          destinationFeature.properties![configDestinationGeometry.y] as number,
        ];

        geoJsonFeatureCollection.features.push(destinationFeature);
      }
    });

    this.originAndDestinationGeoJsonPoints = geoJsonFeatureCollection;
    const geoJsonPointsToDraw = this._filterGeoJsonPointsToDraw(geoJsonFeatureCollection);
    this.addData(geoJsonPointsToDraw);

    return this;
  }

  setAnimationDuration(milliseconds: number): void {
    milliseconds = Number(milliseconds) || this.options.animationDuration;

    if (this._animationTween) {
      this._animationTween.to({ offset: this._animationPropertiesStatic.resetOffset }, milliseconds);
    }

    this._animationPropertiesDynamic.duration = milliseconds;
  }

  setAnimationEasing(easingFamily: string, easingType: string): void {
    const easing = TWEEN.Easing as unknown as EasingRecord;
    let tweenEasingFunction: (t: number) => number;

    if (easing[easingFamily]?.[easingType]) {
      tweenEasingFunction = easing[easingFamily][easingType];
    } else {
      easingFamily = this.options.animationEasingFamily;
      easingType = this.options.animationEasingType;
      tweenEasingFunction = easing[easingFamily][easingType];
    }

    if (this._animationTween) {
      this._animationTween.easing(tweenEasingFunction);
    }

    this._animationPropertiesDynamic.easingInfo = {
      easingFamily,
      easingType,
      tweenEasingFunction,
    };
  }

  getAnimationEasingOptions(prettyPrint?: boolean): Record<string, { types: string[] }> {
    const easing = TWEEN.Easing as unknown as EasingRecord;
    const options: Record<string, { types: string[] }> = {};

    for (const family of Object.keys(easing)) {
      options[family] = { types: Object.keys(easing[family]) };
    }

    if (prettyPrint) {
      const consoleData: Record<string, { types: string }> = {};
      for (const family of Object.keys(options)) {
        consoleData[family] = { types: `"${options[family].types.join('", "')}"` };
      }
      console.table(consoleData);
    }

    return options;
  }

  playAnimation(): void {
    this.options.animationStarted = true;
    this._redrawCanvas();
  }

  stopAnimation(): void {
    this.options.animationStarted = false;
    this._redrawCanvas();
  }

  selectFeaturesForPathDisplay(selectionFeatures: Feature[], selectionMode: SelectionMode): void {
    this._applyFeaturesSelection(selectionFeatures, selectionMode, '_isSelectedForPathDisplay');
  }

  selectFeaturesForPathDisplayById(
    uniqueOriginOrDestinationIdField: string,
    idValue: unknown,
    originBoolean: boolean,
    selectionMode: SelectionMode,
  ): void {
    const { originUniqueIdField, destinationUniqueIdField } = this.options.originAndDestinationFieldIds;

    if (
      uniqueOriginOrDestinationIdField !== originUniqueIdField &&
      uniqueOriginOrDestinationIdField !== destinationUniqueIdField
    ) {
      console.error(
        `Invalid unique id field supplied for origin or destination. It must be one of these: ${originUniqueIdField}, ${destinationUniqueIdField}`,
      );
      return;
    }

    const existingFeature = this.originAndDestinationGeoJsonPoints?.features.find(
      (feature) =>
        feature.properties?.['isOrigin'] === originBoolean &&
        feature.properties?.[uniqueOriginOrDestinationIdField] === idValue,
    );

    if (!existingFeature) return;

    const odInfo = this._getSharedOriginOrDestinationFeatures(existingFeature);

    if (odInfo.isOriginFeature) {
      this.selectFeaturesForPathDisplay(odInfo.sharedOriginFeatures, selectionMode);
    } else {
      this.selectFeaturesForPathDisplay(odInfo.sharedDestinationFeatures, selectionMode);
    }
  }

  clearAllPathSelections(): void {
    this.originAndDestinationGeoJsonPoints?.features.forEach((feature) => {
      feature.properties!['_isSelectedForPathDisplay'] = false;
    });
    this._resetCanvas();
  }

  selectAllFeaturesForPathDisplay(): void {
    this.originAndDestinationGeoJsonPoints?.features.forEach((feature) => {
      feature.properties!['_isSelectedForPathDisplay'] = feature.properties?.['isOrigin'] === true;
    });
    this._resetCanvas();
  }

  // -------------------------------------------------------------------------
  // Leaflet lifecycle overrides
  // -------------------------------------------------------------------------

  onAdd(map: LeafletMap): this {
    super.onAdd(map);

    // Create the two canvas elements (animation canvas on top, main canvas below)
    this._animationCanvasElement = this._insertCustomCanvasElement(map);
    this._canvasElement = this._insertCustomCanvasElement(map);
    this._customCanvases = [this._canvasElement, this._animationCanvasElement];

    this.on('click mouseover', this._modifyInteractionEvent, this);
    map.on('move', this._resetCanvas, this);
    map.on('moveend', this._resetCanvasAndWrapGeoJsonCircleMarkers, this);
    map.on('resize', this._resizeCanvas, this);
    // All modern browsers support 3D transforms, no need for L.Browser.any3d check
    if (map.options.zoomAnimation) {
      map.on('zoomanim', this._animateZoom, this);
    }

    this._resizeCanvas();
    this._resetCanvasAndWrapGeoJsonCircleMarkers();

    return this;
  }

  onRemove(map: LeafletMap): this {
    super.onRemove(map);

    this._clearCanvas();
    this._customCanvases.forEach((canvas) => canvas.remove());

    this.off('click mouseover', this._modifyInteractionEvent, this);
    map.off('move', this._resetCanvas, this);
    map.off('moveend', this._resetCanvasAndWrapGeoJsonCircleMarkers, this);
    map.off('resize', this._resizeCanvas, this);
    if (map.options.zoomAnimation) {
      map.off('zoomanim', this._animateZoom, this);
    }

    return this;
  }

  bringToBack(): this {
    super.bringToBack();

    // Move animation canvas to back of pane first
    const animPane = this._animationCanvasElement?.parentNode;
    if (animPane) {
      animPane.insertBefore(this._animationCanvasElement, animPane.firstChild);
    }

    // Then move main canvas behind animation canvas
    const mainPane = this._canvasElement?.parentNode;
    if (mainPane) {
      mainPane.insertBefore(this._canvasElement, mainPane.firstChild);
    }

    return this;
  }

  bringToFront(): this {
    // Move main canvas to front first
    const mainPane = this._canvasElement?.parentNode;
    if (mainPane) {
      mainPane.appendChild(this._canvasElement);
    }

    // Then move animation canvas in front of the main canvas
    const animPane = this._animationCanvasElement?.parentNode;
    if (animPane) {
      animPane.appendChild(this._animationCanvasElement);
    }

    super.bringToFront();
    return this;
  }

  // -------------------------------------------------------------------------
  // Private methods
  // -------------------------------------------------------------------------

  private _filterGeoJsonPointsToDraw(geoJsonFeatureCollection: FeatureCollection): FeatureCollection {
    const { originUniqueIdField, destinationUniqueIdField } = this.options.originAndDestinationFieldIds;
    const originIds: unknown[] = [];
    const destinationIds: unknown[] = [];
    const features: Feature[] = [];

    for (const feature of geoJsonFeatureCollection.features) {
      const props = feature.properties ?? {};
      const isOrigin = props['isOrigin'] as boolean;

      if (isOrigin) {
        const id = props[originUniqueIdField];
        if (!originIds.includes(id)) {
          originIds.push(id);
          features.push(feature);
        }
      } else {
        const id = props[destinationUniqueIdField];
        if (!destinationIds.includes(id)) {
          destinationIds.push(id);
          features.push(feature);
        }
      }
    }

    return { type: 'FeatureCollection', features };
  }

  private _insertCustomCanvasElement(map: LeafletMap): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.className = 'leaflet-zoom-animated';
    canvas.style.transformOrigin = '50% 50%';

    const paneName = this.options.pane ?? 'overlayPane';
    const pane = map.getPane(paneName);
    if (pane) {
      pane.insertBefore(canvas, pane.firstChild);
    }

    return canvas;
  }

  private _modifyInteractionEvent(e: LeafletEvent): void {
    const evt = e as LeafletEvent & Record<string, unknown>;
    const layer = evt['layer'] as { feature?: Feature } | undefined;
    if (!layer?.feature) return;

    const odInfo = this._getSharedOriginOrDestinationFeatures(layer.feature);
    evt['isOriginFeature'] = odInfo.isOriginFeature;
    evt['sharedOriginFeatures'] = odInfo.sharedOriginFeatures;
    evt['sharedDestinationFeatures'] = odInfo.sharedDestinationFeatures;
  }

  private _getSharedOriginOrDestinationFeatures(testFeature: Feature): {
    isOriginFeature: boolean;
    sharedOriginFeatures: Feature[];
    sharedDestinationFeatures: Feature[];
  } {
    const isOriginFeature = testFeature.properties?.['isOrigin'] as boolean;
    const { originUniqueIdField, destinationUniqueIdField } = this.options.originAndDestinationFieldIds;
    const allFeatures = this.originAndDestinationGeoJsonPoints?.features ?? [];

    let sharedOriginFeatures: Feature[] = [];
    let sharedDestinationFeatures: Feature[] = [];

    if (isOriginFeature) {
      const testId = testFeature.properties?.[originUniqueIdField];
      sharedOriginFeatures = allFeatures.filter(
        (f) => f.properties?.['isOrigin'] && f.properties[originUniqueIdField] === testId,
      );
    } else {
      const testId = testFeature.properties?.[destinationUniqueIdField];
      sharedDestinationFeatures = allFeatures.filter(
        (f) => f.properties?.['isOrigin'] && f.properties[destinationUniqueIdField] === testId,
      );
    }

    return { isOriginFeature, sharedOriginFeatures, sharedDestinationFeatures };
  }

  private _applyFeaturesSelection(
    selectionFeatures: Feature[],
    selectionMode: SelectionMode,
    selectionAttributeName: string,
  ): void {
    const selectionIds = selectionFeatures.map((f) => f.properties?.['_uniqueId']);
    const allFeatures = this.originAndDestinationGeoJsonPoints?.features ?? [];

    if (selectionMode === 'SELECTION_NEW') {
      allFeatures.forEach((feature) => {
        feature.properties![selectionAttributeName] = selectionIds.includes(
          feature.properties?.['_uniqueId'],
        );
      });
    } else if (selectionMode === 'SELECTION_ADD') {
      allFeatures.forEach((feature) => {
        if (selectionIds.includes(feature.properties?.['_uniqueId'])) {
          feature.properties![selectionAttributeName] = true;
        }
      });
    } else if (selectionMode === 'SELECTION_SUBTRACT') {
      allFeatures.forEach((feature) => {
        if (selectionIds.includes(feature.properties?.['_uniqueId'])) {
          feature.properties![selectionAttributeName] = false;
        }
      });
    } else {
      return;
    }

    this._resetCanvas();
  }

  private _animateZoom(e: { zoom: number; center: LatLng }): void {
    // Uses internal Leaflet map methods for zoom animation — compatible with v1 and v2
    const map = (this as unknown as { _map: LeafletMap & Record<string, (...args: unknown[]) => unknown> })._map;
    const scale = map.getZoomScale(e.zoom);
    const offset = (
      map._getCenterOffset(e.center) as { _multiplyBy: (n: number) => { subtract: (p: unknown) => unknown } }
    )
      ._multiplyBy(-scale)
      .subtract(map._getMapPanePos());

    this._customCanvases.forEach((canvas) => {
      DomUtil.setTransform(canvas, offset as Parameters<typeof DomUtil.setTransform>[1], scale);
    });
  }

  private _resizeCanvas(): void {
    const map = (this as unknown as { _map: LeafletMap })._map;
    if (!map) return;
    const size = map.getSize();
    this._customCanvases.forEach((canvas) => {
      canvas.width = size.x;
      canvas.height = size.y;
    });
    this._resetCanvas();
  }

  private _resetCanvas(): void {
    const map = (this as unknown as { _map: LeafletMap })._map;
    if (!map) return;

    const topLeft = map.containerPointToLayerPoint([0, 0]);
    this._customCanvases.forEach((canvas) => {
      DomUtil.setPosition(canvas, topLeft);
    });

    this._redrawCanvas();
  }

  private _resetCanvasAndWrapGeoJsonCircleMarkers(): void {
    this._resetCanvas();
    this._wrapGeoJsonCircleMarkers();
  }

  private _redrawCanvas(): void {
    const map = (this as unknown as { _map: LeafletMap })._map;
    if (!map || !this.originAndDestinationGeoJsonPoints) return;

    this._clearCanvas();
    this._drawSelectedCanvasPaths(false);

    if (this._animationFrameId !== undefined) {
      cancelAnimationFrame(this._animationFrameId);
      this._animationFrameId = undefined;
    }

    const hasSelectedFeatures = this.originAndDestinationGeoJsonPoints.features.some(
      (f) => f.properties?.['_isSelectedForPathDisplay'],
    );

    if (this.options.animationStarted && hasSelectedFeatures) {
      this._startAnimationLoop();
    }
  }

  private _clearCanvas(): void {
    this._customCanvases.forEach((canvas) => {
      canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    });

    if (this._animationFrameId !== undefined) {
      cancelAnimationFrame(this._animationFrameId);
      this._animationFrameId = undefined;
    }
  }

  private _drawSelectedCanvasPaths(animate: boolean): void {
    const ctx = animate
      ? this._animationCanvasElement.getContext('2d')
      : this._canvasElement.getContext('2d');

    if (!ctx) return;

    const map = (this as unknown as { _map: LeafletMap })._map;
    if (!map) return;

    const { originGeometry, destinationGeometry } = this.options.originAndDestinationFieldIds;

    this.originAndDestinationGeoJsonPoints?.features.forEach((feature) => {
      if (!feature.properties?.['_isSelectedForPathDisplay']) return;

      const originX = feature.properties[originGeometry.x] as number;
      const originY = feature.properties[originGeometry.y] as number;
      const destX = feature.properties[destinationGeometry.x] as number;
      const destY = feature.properties[destinationGeometry.y] as number;

      const originLatLng = this._wrapAroundLatLng(new LatLng(originY, originX));
      const destinationLatLng = this._wrapAroundLatLng(new LatLng(destY, destX));

      const screenOriginPoint = map.latLngToContainerPoint(originLatLng);
      const screenDestinationPoint = map.latLngToContainerPoint(destinationLatLng);

      if (animate) {
        const symbol = this._getSymbolProperties(feature, this.options.animatedCanvasBezierStyle);
        ctx.beginPath();
        this._animateCanvasLineSymbol(ctx, symbol, screenOriginPoint, screenDestinationPoint);
        ctx.stroke();
        ctx.closePath();
      } else {
        const symbol = this._getSymbolProperties(feature, this.options.canvasBezierStyle);
        ctx.beginPath();
        this._applyCanvasLineSymbol(ctx, symbol, screenOriginPoint, screenDestinationPoint);
        ctx.stroke();
        ctx.closePath();
      }
    });
  }

  private _getSymbolProperties(feature: Feature, canvasSymbolConfig: CanvasBezierStyle): CanvasLineSymbol {
    if (canvasSymbolConfig.type === 'simple') {
      return canvasSymbolConfig.symbol;
    }

    if (canvasSymbolConfig.type === 'uniqueValue') {
      const value = feature.properties?.[canvasSymbolConfig.field];
      const match = canvasSymbolConfig.uniqueValueInfos.find((info) => info.value === value);
      return match?.symbol ?? canvasSymbolConfig.uniqueValueInfos[0].symbol;
    }

    // classBreaks
    const value = feature.properties?.[canvasSymbolConfig.field] as number;
    const match = canvasSymbolConfig.classBreakInfos.find(
      (info) => info.classMinValue <= value && info.classMaxValue >= value,
    );
    return match?.symbol ?? canvasSymbolConfig.defaultSymbol;
  }

  private _applyCanvasLineSymbol(
    ctx: CanvasRenderingContext2D,
    symbol: CanvasLineSymbol,
    origin: { x: number; y: number },
    destination: { x: number; y: number },
  ): void {
    ctx.lineCap = symbol.lineCap;
    ctx.lineWidth = symbol.lineWidth;
    ctx.strokeStyle = symbol.strokeStyle;
    ctx.shadowBlur = symbol.shadowBlur;
    ctx.shadowColor = symbol.shadowColor;
    ctx.moveTo(origin.x, origin.y);
    ctx.bezierCurveTo(origin.x, destination.y, destination.x, destination.y, destination.x, destination.y);
  }

  private _animateCanvasLineSymbol(
    ctx: CanvasRenderingContext2D,
    symbol: CanvasLineSymbol,
    origin: { x: number; y: number },
    destination: { x: number; y: number },
  ): void {
    const dashSize = symbol.lineDashOffsetSize ?? 4;
    ctx.lineCap = symbol.lineCap;
    ctx.lineWidth = symbol.lineWidth;
    ctx.strokeStyle = symbol.strokeStyle;
    ctx.shadowBlur = symbol.shadowBlur;
    ctx.shadowColor = symbol.shadowColor;
    ctx.setLineDash([dashSize, this._animationPropertiesStatic.resetOffset - dashSize]);
    ctx.lineDashOffset = -this._animationPropertiesStatic.offset;
    ctx.moveTo(origin.x, origin.y);
    ctx.bezierCurveTo(origin.x, destination.y, destination.x, destination.y, destination.x, destination.y);
  }

  private _startAnimationLoop(): void {
    const step = (time: number) => {
      this._animationCanvasElement
        .getContext('2d')
        ?.clearRect(0, 0, this._animationCanvasElement.width, this._animationCanvasElement.height);

      this._drawSelectedCanvasPaths(true);

      TWEEN.update(time);

      this._animationFrameId = requestAnimationFrame(step);
    };

    this._animationFrameId = requestAnimationFrame(step);
  }

  private _wrapGeoJsonCircleMarkers(): void {
    this.eachLayer((layer) => {
      const latlng = (layer as { getLatLng?: () => LatLng; setLatLng?: (ll: LatLng) => void }).getLatLng?.();
      if (latlng) {
        const wrapped = this._wrapAroundLatLng(latlng);
        (layer as { setLatLng?: (ll: LatLng) => void }).setLatLng?.(wrapped);
      }
    });
  }

  private _wrapAroundLatLng(latLng: LatLng): LatLng {
    const map = (this as unknown as { _map: LeafletMap })._map;
    if (!map || !this.options.wrapAroundCanvas) return latLng;

    const wrapped = latLng.clone();
    const mapCenterLng = map.getCenter().lng;
    const diff = mapCenterLng - wrapped.lng;

    if (diff < -180 || diff > 180) {
      wrapped.lng += Math.round(diff / 360) * 360;
    }

    return wrapped;
  }
}

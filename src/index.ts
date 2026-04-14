export { CanvasFlowmapLayer } from './CanvasFlowmapLayer';
export type {
  CanvasFlowmapLayerOptions,
  CanvasFlowmapLayerMouseEvent,
  CanvasBezierStyle,
  CanvasLineSymbol,
  OriginAndDestinationFieldIds,
  GeometryFieldIds,
  SelectionMode,
} from './CanvasFlowmapLayer';

import { CanvasFlowmapLayer } from './CanvasFlowmapLayer';
import type { CanvasFlowmapLayerOptions } from './CanvasFlowmapLayer';
import type { FeatureCollection } from 'geojson';

/** Convenience factory function equivalent to `new CanvasFlowmapLayer(geoJson, options)`. */
export function canvasFlowmapLayer(
  geoJson: FeatureCollection,
  options?: Partial<CanvasFlowmapLayerOptions>,
): CanvasFlowmapLayer {
  return new CanvasFlowmapLayer(geoJson, options);
}

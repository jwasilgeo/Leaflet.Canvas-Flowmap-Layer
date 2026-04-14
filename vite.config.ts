import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      // UMD global: window.LeafletCanvasFlowmapLayer.CanvasFlowmapLayer / .canvasFlowmapLayer
      name: 'LeafletCanvasFlowmapLayer',
      fileName: 'canvas-flowmap-layer',
      formats: ['es', 'umd'],
    },
    rollupOptions: {
      external: ['leaflet'],
      output: {
        globals: {
          leaflet: 'L',
        },
      },
    },
    sourcemap: true,
  },
  plugins: [
    dts({
      insertTypesEntry: true,
      outDir: 'dist',
      include: ['src'],
    }),
  ],
});

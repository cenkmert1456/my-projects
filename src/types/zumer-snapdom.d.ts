/**
 * Ambient type declarations for `@zumer/snapdom`.
 *
 * The published package declares `types: ./types/snapdom.d.ts` but the
 * installed tarball ships an empty `types/` directory, so TypeScript cannot
 * resolve the module. These declarations describe the real public API of the
 * library (the subset used across the app) so strict mode stays fully on.
 */

declare module "@zumer/snapdom" {
  export interface SnapdomOptions {
    /** Use the fast rendering path. */
    fast?: boolean;
    /** Scaling factor applied to the output. */
    scale?: number;
    /** Clamp the output width (px). */
    width?: number;
    /** Clamp the output height (px). */
    height?: number;
    /** Background color to render behind transparent areas. */
    backgroundColor?: string | null;
    /** Skip elements for which this returns true. */
    ignoreElements?: (element: HTMLElement) => boolean;
    /** Callback invoked with the cloned document before rendering. */
    onclone?: (document: Document) => void;
  }

  /** Render an element to an off-screen canvas. */
  export function toCanvas(
    element: HTMLElement,
    options?: SnapdomOptions,
  ): Promise<HTMLCanvasElement>;

  /** Render an element to a PNG data URL. */
  export function toPng(
    element: HTMLElement,
    options?: SnapdomOptions,
  ): Promise<string>;

  /** Render an element to a JPEG data URL. */
  export function toJpeg(
    element: HTMLElement,
    options?: SnapdomOptions,
  ): Promise<string>;

  /** Render an element to an SVG data URL. */
  export function toSvg(
    element: HTMLElement,
    options?: SnapdomOptions,
  ): Promise<string>;

  /** Render an element to a Blob. */
  export function toBlob(
    element: HTMLElement,
    options?: SnapdomOptions,
  ): Promise<Blob>;

  /** Render an element and return its raw RGBA pixel data. */
  export function toPixelData(
    element: HTMLElement,
    options?: SnapdomOptions,
  ): Promise<Uint8ClampedArray>;

  /**
   * The library namespace object, mirroring the named exports so both
   * `import { snapdom }` and `import { toCanvas }` usages typecheck.
   */
  export const snapdom: {
    toCanvas: typeof toCanvas;
    toPng: typeof toPng;
    toJpeg: typeof toJpeg;
    toSvg: typeof toSvg;
    toBlob: typeof toBlob;
    toPixelData: typeof toPixelData;
  };

  const snapdomDefault: typeof snapdom;
  export default snapdomDefault;
}

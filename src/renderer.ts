import {
  EMPTY_TRIANGLE_ID,
  MAX_HEIGHT,
  MAX_TRIANGLES,
  MAX_WIDTH,
  NEAR_Z,
  type Camera,
  type RenderOptions,
  type RenderResult,
  type Rgba,
} from './types';
import { transformToCamera } from './camera';

interface ClipVertex {
  x: number;
  y: number;
  z: number;
  r: number;
  g: number;
  b: number;
  a: number;
}

interface ScreenVertex extends ClipVertex {
  sx: number;
  sy: number;
}

const PIXEL_EPSILON = 1e-8;
const MIN_AREA = 1e-10;

/**
 * Software-renders one frame. It uses Canvas-compatible RGBA bytes, a float
 * depth buffer containing camera-space z, and an integer source-triangle ID
 * buffer. This function has no DOM dependencies and is the only rasterizer:
 * both tests and the Worker call it.
 */
export function renderFrame(options: RenderOptions): RenderResult {
  const width = normalizePositiveInteger(options.width, 'width', MAX_WIDTH);
  const height = normalizePositiveInteger(options.height, 'height', MAX_HEIGHT);
  if (options.triangles.length > MAX_TRIANGLES) {
    throw new Error(`A frame may contain at most ${MAX_TRIANGLES} triangles`);
  }
  if (!(options.camera.focalLength > 0) || !Number.isFinite(options.camera.focalLength)) {
    throw new Error('Camera focal length must be a positive finite number');
  }

  const centerX = options.centerX ?? width / 2;
  const centerY = options.centerY ?? height / 2;
  const background = normalizeColor(options.background ?? { r: 0, g: 0, b: 0, a: 255 });

  const color = new Uint8ClampedArray(width * height * 4);
  const depth = new Float32Array(width * height).fill(Infinity);
  const id = new Int32Array(width * height).fill(EMPTY_TRIANGLE_ID);
  clearColor(color, background);

  for (let triangleIndex = 0; triangleIndex < options.triangles.length; triangleIndex++) {
    const triangle = options.triangles[triangleIndex];
    if (!triangle) continue;

    const cameraVertices = [triangle.a, triangle.b, triangle.c].map((vertex) => {
      const p = transformToCamera(vertex.position, options.camera);
      const c = normalizeColor(vertex.color);
      return { ...p, r: c.r, g: c.g, b: c.b, a: c.a };
    });

    const clipped = clipTriangleToNearPlane(cameraVertices as ClipVertex[]);
    for (let fanIndex = 1; fanIndex + 1 < clipped.length; fanIndex++) {
      rasterTriangle(
        project(clipped[0]!, options.camera, centerX, centerY),
        project(clipped[fanIndex]!, options.camera, centerX, centerY),
        project(clipped[fanIndex + 1]!, options.camera, centerX, centerY),
        triangleIndex,
        width,
        height,
        color,
        depth,
        id,
      );
    }
  }

  return { width, height, color, depth, id };
}

export function pickTriangleId(frame: Pick<RenderResult, 'width' | 'height' | 'id'>, x: number, y: number): number {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= frame.width || y >= frame.height) {
    return EMPTY_TRIANGLE_ID;
  }
  return frame.id[y * frame.width + x] ?? EMPTY_TRIANGLE_ID;
}

function clipTriangleToNearPlane(input: readonly ClipVertex[]): ClipVertex[] {
  // A single half-space is enough here. Sutherland-Hodgman retains input
  // attributes and creates correctly interpolated intersection vertices.
  const output: ClipVertex[] = [];
  for (let i = 0; i < input.length; i++) {
    const current = input[i]!;
    const previous = input[(i + input.length - 1) % input.length]!;
    const currentInside = current.z >= NEAR_Z;
    const previousInside = previous.z >= NEAR_Z;

    if (currentInside) {
      if (!previousInside) output.push(intersectNear(previous, current));
      output.push(current);
    } else if (previousInside) {
      output.push(intersectNear(previous, current));
    }
  }

  return output;
}

function intersectNear(out: ClipVertex, inn: ClipVertex): ClipVertex {
  const denominator = inn.z - out.z;
  const t = (NEAR_Z - out.z) / denominator;
  return {
    x: mix(out.x, inn.x, t),
    y: mix(out.y, inn.y, t),
    z: NEAR_Z,
    r: mix(out.r, inn.r, t),
    g: mix(out.g, inn.g, t),
    b: mix(out.b, inn.b, t),
    a: mix(out.a, inn.a, t),
  };
}

function project(v: ClipVertex, camera: Camera, centerX: number, centerY: number): ScreenVertex {
  const scale = camera.focalLength / v.z;
  return {
    ...v,
    sx: centerX + v.x * scale,
    // Screen rows grow downward while camera up is +Y.
    sy: centerY - v.y * scale,
  };
}

function rasterTriangle(
  initial0: ScreenVertex,
  initial1: ScreenVertex,
  initial2: ScreenVertex,
  triangleId: number,
  width: number,
  height: number,
  color: Uint8ClampedArray,
  depth: Float32Array,
  ids: Int32Array,
): void {
  let p0 = initial0;
  let p1 = initial1;
  let p2 = initial2;

  let area2 = edgeValue(p0, p1, p2);
  if (Math.abs(area2) < MIN_AREA) return;

  // Normalize to screen-clockwise coordinates so this edge equation is positive
  // in the interior. The edge directions then match the top-left rule below.
  if (area2 < 0) {
    [p1, p2] = [p2, p1];
    area2 = -area2;
  }

  const minX = Math.max(0, Math.ceil(Math.min(p0.sx, p1.sx, p2.sx) - 0.5));
  const maxX = Math.min(width - 1, Math.floor(Math.max(p0.sx, p1.sx, p2.sx) - 0.5));
  const minY = Math.max(0, Math.ceil(Math.min(p0.sy, p1.sy, p2.sy) - 0.5));
  const maxY = Math.min(height - 1, Math.floor(Math.max(p0.sy, p1.sy, p2.sy) - 0.5));
  if (minX > maxX || minY > maxY) return;

  const dx01 = p1.sx - p0.sx;
  const dy01 = p1.sy - p0.sy;
  const dx12 = p2.sx - p1.sx;
  const dy12 = p2.sy - p1.sy;
  const dx20 = p0.sx - p2.sx;
  const dy20 = p0.sy - p2.sy;

  const startX = minX + 0.5;
  const startY = minY + 0.5;
  let e01Row = edgeValue(p0, p1, { sx: startX, sy: startY } as ScreenVertex);
  let e12Row = edgeValue(p1, p2, { sx: startX, sy: startY } as ScreenVertex);
  let e20Row = edgeValue(p2, p0, { sx: startX, sy: startY } as ScreenVertex);

  for (let y = minY; y <= maxY; y++) {
    let e01 = e01Row;
    let e12 = e12Row;
    let e20 = e20Row;

    for (let x = minX; x <= maxX; x++) {
      if (coversEdge(e01, dx01, dy01) && coversEdge(e12, dx12, dy12) && coversEdge(e20, dx20, dy20)) {
        const w0 = e12 / area2;
        const w1 = e20 / area2;
        const w2 = e01 / area2;

        const inverseW = w0 / p0.z + w1 / p1.z + w2 / p2.z;
        const z = 1 / inverseW;
        const pixelIndex = y * width + x;

        if (z < depth[pixelIndex]!) {
          const inverseColorScale = z;
          const r = (w0 * p0.r / p0.z + w1 * p1.r / p1.z + w2 * p2.r / p2.z) * inverseColorScale;
          const g = (w0 * p0.g / p0.z + w1 * p1.g / p1.z + w2 * p2.g / p2.z) * inverseColorScale;
          const b = (w0 * p0.b / p0.z + w1 * p1.b / p1.z + w2 * p2.b / p2.z) * inverseColorScale;
          const a = (w0 * p0.a / p0.z + w1 * p1.a / p1.z + w2 * p2.a / p2.z) * inverseColorScale;
          const offset = pixelIndex * 4;
          color[offset] = r;
          color[offset + 1] = g;
          color[offset + 2] = b;
          color[offset + 3] = a;
          depth[pixelIndex] = z;
          ids[pixelIndex] = triangleId;
        }
      }

      e01 += -dy01;
      e12 += -dy12;
      e20 += -dy20;
    }

    e01Row += dx01;
    e12Row += dx12;
    e20Row += dx20;
  }
}

function edgeValue(a: ScreenVertex, b: ScreenVertex, p: { sx: number; sy: number }): number {
  const dx = b.sx - a.sx;
  const dy = b.sy - a.sy;
  return dx * (p.sy - a.sy) - dy * (p.sx - a.sx);
}

/**
 * Integer-pixel top-left fill convention. For the normalized clockwise edges,
 * exact horizontal top and vertical left edges are included; the complementary
 * bottom/right edges are not. A small epsilon only absorbs floating-point
 * error around an exact edge.
 */
function coversEdge(value: number, dx: number, dy: number): boolean {
  if (value <= -PIXEL_EPSILON) return false;
  if (value >= PIXEL_EPSILON) return true;
  return isTopOrLeftEdge(dx, dy);
}

function isTopOrLeftEdge(dx: number, dy: number): boolean {
  // With edgeValue = dx*(py-ay)-dy*(px-ax), a screen-clockwise triangle has a
  // positive interior. A top edge moves right; a left edge moves upward.
  return dy < 0 || (dy === 0 && dx > 0);
}

function clearColor(color: Uint8ClampedArray, background: Required<Rgba>): void {
  for (let i = 0; i < color.length; i += 4) {
    color[i] = background.r;
    color[i + 1] = background.g;
    color[i + 2] = background.b;
    color[i + 3] = background.a;
  }
}

function normalizeColor(color: Rgba): Required<Rgba> {
  const result = {
    r: clampChannel(color.r),
    g: clampChannel(color.g),
    b: clampChannel(color.b),
    a: color.a === undefined ? 255 : clampChannel(color.a),
  };
  return result;
}

function clampChannel(value: number): number {
  if (!Number.isFinite(value)) throw new Error('Color channels must be finite numbers');
  return Math.min(255, Math.max(0, value));
}

function normalizePositiveInteger(value: number, name: string, max: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  if (value > max) throw new Error(`${name} must be at most ${max}`);
  return value;
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

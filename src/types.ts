export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a?: number;
}

export interface Vertex {
  position: Vec3;
  color: Rgba;
}

export interface Triangle {
  a: Vertex;
  b: Vertex;
  c: Vertex;
}

export interface Camera {
  /** Camera position in world space. */
  position: Vec3;
  /** Camera-space right vector, mapped to screen +X. Must be unit length. */
  right: Vec3;
  /** Camera-space up vector, mapped to screen -Y. Must be unit length. */
  up: Vec3;
  /**
   * Unit vector for the camera's viewing axis. A camera-space point has
   * z = dot(worldPoint - position, forward), so visible points have positive z.
   * The default orbit camera sits at -Z and uses world +Z as this vector.
   */
  forward: Vec3;
  focalLength: number;
}

export interface OrbitOptions {
  yaw?: number;
  pitch?: number;
  distance?: number;
  target?: Vec3;
  focalLength?: number;
}

export interface RenderOptions {
  width: number;
  height: number;
  triangles: readonly Triangle[];
  camera: Camera;
  /** Pixel coordinates of the projection center. Defaults to canvas center. */
  centerX?: number;
  centerY?: number;
  background?: Rgba;
}

export interface RenderResult {
  width: number;
  height: number;
  color: Uint8ClampedArray<ArrayBuffer>;
  depth: Float32Array<ArrayBuffer>;
  id: Int32Array<ArrayBuffer>;
}

export const EMPTY_TRIANGLE_ID = -1;
export const MAX_TRIANGLES = 500;
export const MAX_WIDTH = 640;
export const MAX_HEIGHT = 480;
export const NEAR_Z = 1;

export interface RenderRequest {
  kind: 'render';
  frameId: number;
  width: number;
  height: number;
  triangles: readonly Triangle[];
  camera: Camera;
  centerX?: number;
  centerY?: number;
  background?: Rgba;
}

export interface RenderResponse {
  kind: 'rendered';
  frameId: number;
  width: number;
  height: number;
  /** Transferred ownership to the receiving context. */
  color: ArrayBuffer;
  depth: ArrayBuffer;
  id: ArrayBuffer;
}

export type WorkerRenderRequestMessage = RenderRequest;
export type WorkerRenderResponseMessage = RenderResponse;

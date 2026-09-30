import { FrameStateManager, type CommittedFrame } from './frameState';
import {
  MAX_HEIGHT,
  MAX_WIDTH,
  type Camera,
  type RenderRequest,
  type Triangle,
  type WorkerRenderResponseMessage,
} from './types';

export interface MeshViewerOptions {
  width?: number;
  height?: number;
  worker?: Worker;
  onFrame?: (frame: CommittedFrame) => void;
}

export class MeshViewer {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly worker: Worker;
  private readonly ownsWorker: boolean;
  private readonly frameState = new FrameStateManager();
  private readonly onFrame?: (frame: CommittedFrame) => void;

  private triangles: readonly Triangle[] = [];
  private camera: Camera | null = null;
  private imageData: ImageData | null = null;
  private disposed = false;
  private renderQueued = false;

  constructor(canvas: HTMLCanvasElement, options: MeshViewerOptions = {}) {
    this.canvas = canvas;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('2D Canvas context is required');
    this.context = context;
    this.onFrame = options.onFrame;

    if (options.worker) {
      this.worker = options.worker;
      this.ownsWorker = false;
    } else {
      this.worker = new Worker(new URL('./renderWorker.ts', import.meta.url), { type: 'module' });
      this.ownsWorker = true;
    }

    this.worker.addEventListener('message', (event: MessageEvent<WorkerRenderResponseMessage>) => {
      this.handleWorkerMessage(event.data);
    });

    const width = clampDimension(options.width ?? canvas.width, MAX_WIDTH);
    const height = clampDimension(options.height ?? canvas.height, MAX_HEIGHT);
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
      throw new Error('Canvas dimensions must be positive integers');
    }
    canvas.width = width;
    canvas.height = height;
  }

  setMesh(triangles: readonly Triangle[]): void {
    if (triangles.length > 500) throw new Error('At most 500 triangles are supported');
    this.triangles = triangles;
    this.requestRender();
  }

  setCamera(camera: Camera): void {
    this.camera = camera;
    this.requestRender();
  }

  resize(width: number, height: number): void {
    const nextWidth = clampDimension(width, MAX_WIDTH);
    const nextHeight = clampDimension(height, MAX_HEIGHT);
    if (nextWidth === this.canvas.width && nextHeight === this.canvas.height) return;

    this.canvas.width = nextWidth;
    this.canvas.height = nextHeight;
    this.imageData = null;
    this.context.fillStyle = '#000';
    this.context.fillRect(0, 0, nextWidth, nextHeight);

    // Any response for the old dimensions is now stale and is rejected on
    // arrival. Picking stays unavailable until a frame for this size commits.
    this.frameState.startFrame(nextWidth, nextHeight);
    this.requestRender();
  }

  /**
   * Queries only the ID buffer from the currently committed frame. CSS pixel
   * coordinates are converted to backing-store pixels. There is no ray/object
   * approximation path.
   */
  pick(clientX: number, clientY: number): number {
    const rect = this.canvas.getBoundingClientRect();
    const x = Math.floor(((clientX - rect.left) / rect.width) * this.canvas.width);
    const y = Math.floor(((clientY - rect.top) / rect.height) * this.canvas.height);
    return this.frameState.pick(x, y);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.ownsWorker) this.worker.terminate();
  }

  private requestRender(): void {
    if (this.disposed || !this.camera || this.renderQueued) return;
    this.renderQueued = true;
    queueMicrotask(() => {
      this.renderQueued = false;
      if (this.disposed || !this.camera) return;

      const width = this.canvas.width;
      const height = this.canvas.height;
      const frameId = this.frameState.startFrame(width, height);
      const request: RenderRequest = {
        kind: 'render',
        frameId,
        width,
        height,
        triangles: this.triangles,
        camera: this.camera,
      };
      this.worker.postMessage(request);
    });
  }

  private handleWorkerMessage(message: WorkerRenderResponseMessage): void {
    if (message.kind !== 'rendered' || this.disposed) return;

    const committed = this.frameState.commitResponse(message);
    if (!committed) {
      // Deliberately dropped: the user has a newer camera or canvas size.
      return;
    }

    this.imageData = new ImageData(committed.color, committed.width, committed.height);
    if (this.canvas.width !== committed.width || this.canvas.height !== committed.height) return;
    this.context.putImageData(this.imageData, 0, 0);
    this.onFrame?.(committed);
  }
}

function clampDimension(value: number, max: number): number {
  if (!Number.isInteger(value) || value <= 0) throw new Error('Dimensions must be positive integers');
  return Math.min(value, max);
}

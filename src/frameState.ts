import { EMPTY_TRIANGLE_ID } from './types';
import { pickTriangleId } from './renderer';

export interface CommittedFrame {
  frameId: number;
  width: number;
  height: number;
  color: Uint8ClampedArray<ArrayBuffer>;
  depth: Float32Array<ArrayBuffer>;
  id: Int32Array<ArrayBuffer>;
}

/**
 * Owns the single frame whose data may be displayed and picked. A late Worker
 * response from an old camera or an old canvas size is rejected here, so it can
 * never overwrite either the image or the ID buffer used for mouse picking.
 */
export class FrameStateManager {
  private requestedFrameId = 0;
  private committedFrameId = 0;
  private frame: CommittedFrame | null = null;
  private width = 0;
  private height = 0;

  startFrame(width: number, height: number): number {
    this.width = width;
    this.height = height;
    this.requestedFrameId += 1;
    return this.requestedFrameId;
  }

  get latestRequestedFrameId(): number {
    return this.requestedFrameId;
  }

  get currentFrame(): CommittedFrame | null {
    return this.frame;
  }

  get size(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  isCurrentRequest(frameId: number, width: number, height: number): boolean {
    return frameId === this.requestedFrameId && width === this.width && height === this.height;
  }

  commitResponse(
    response: { frameId: number; width: number; height: number; color: ArrayBuffer; depth: ArrayBuffer; id: ArrayBuffer },
  ): CommittedFrame | null {
    if (!this.isCurrentRequest(response.frameId, response.width, response.height)) {
      return null;
    }

    const next: CommittedFrame = {
      frameId: response.frameId,
      width: response.width,
      height: response.height,
      color: new Uint8ClampedArray(response.color),
      depth: new Float32Array(response.depth),
      id: new Int32Array(response.id),
    };

    this.frame = next;
    this.committedFrameId = response.frameId;
    return next;
  }

  pick(x: number, y: number): number {
    if (!this.frame) return EMPTY_TRIANGLE_ID;
    if (this.frame.width !== this.width || this.frame.height !== this.height) {
      return EMPTY_TRIANGLE_ID;
    }
    return pickTriangleId(this.frame, x, y);
  }

  get committedId(): number {
    return this.committedFrameId;
  }
}

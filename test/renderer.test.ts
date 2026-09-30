import { describe, expect, it } from 'vitest';
import { createOrbitCamera, transformToCamera } from '../src/camera';
import { renderFrame, pickTriangleId } from '../src/renderer';
import { createRenderResponse } from '../src/renderWorker';
import { FrameStateManager } from '../src/frameState';
import { EMPTY_TRIANGLE_ID, type Camera, type Rgba, type Triangle, type Vertex } from '../src/types';

const identityCamera: Camera = {
  position: { x: 0, y: 0, z: 0 },
  right: { x: 1, y: 0, z: 0 },
  up: { x: 0, y: 1, z: 0 },
  forward: { x: 0, y: 0, z: 1 },
  focalLength: 8,
};

function v(x: number, y: number, z: number, color: Rgba): Vertex {
  return { position: { x, y, z }, color };
}

function tri(a: Vertex, b: Vertex, c: Vertex): Triangle {
  return { a, b, c };
}

const red: Rgba = { r: 255, g: 0, b: 0 };
const green: Rgba = { r: 0, g: 255, b: 0 };
const blue: Rgba = { r: 0, g: 0, b: 255 };

function pixel(frame: ReturnType<typeof renderFrame>, x: number, y: number) {
  const index = y * frame.width + x;
  return {
    rgba: Array.from(frame.color.slice(index * 4, index * 4 + 4)),
    depth: frame.depth[index],
    id: frame.id[index],
  };
}

describe('software renderer', () => {
  it('clips a triangle crossing z=1 and interpolates the clipped vertices', () => {
    // 17x17 with principal point (8.5,8.5): pixel (8,7) center is (8.5,7.5).
    // After clipping, weights at C/A intersection, A, and A/B intersection are
    // 1/24, 11/12, 1/24; inverse depth is 13/24.
    const triangles = [
      tri(
        v(0, 0, 2, red),
        v(-2, 2, 2 / 3, blue),
        v(2, 2, 2 / 3, green),
      ),
    ];

    const frame = renderFrame({
      width: 17,
      height: 17,
      triangles,
      camera: identityCamera,
      centerX: 8.5,
      centerY: 8.5,
    });

    expect(pixel(frame, 8, 7)).toMatchObject({
      rgba: [226, 15, 15, 255],
      id: 0,
    });
    expect(frame.depth[7 * 17 + 8]).toBeCloseTo(24 / 13, 6);

    // Both original vertices behind the near plane must not generate pixels.
    expect(frame.id.some((value) => value > 0)).toBe(false);
    expect(pickTriangleId(frame, -1, 0)).toBe(EMPTY_TRIANGLE_ID);
  });

  it('uses perspective-correct rather than screen-linear interpolation', () => {
    const triangles = [
      tri(
        v(0, -1, 2, red),
        v(-2, 1, 1, green),
        v(2, 1, 4, blue),
      ),
    ];

    const frame = renderFrame({
      width: 17,
      height: 17,
      triangles,
      camera: identityCamera,
      centerX: 8.5,
      centerY: 8.5,
    });

    // Pixel (8,9): screen barycentric weights = 7/12, 1/12, 1/3; depth = 24/11.
    expect(frame.depth[9 * 17 + 8]).toBeCloseTo(24 / 11, 6);
    expect(pixel(frame, 8, 9).rgba).toEqual([162, 46, 46, 255]);
  });

  it('applies an exact integer-pixel top/left boundary convention', () => {
    // Unit square split from bottom-left to top-right. Pixel center (8.5,8.5)
    // is exactly on that diagonal and belongs only to the second triangle.
    const triangles = [
      tri(v(-1, 1, 1, red), v(-1, -1, 1, red), v(1, 1, 1, red)),
      tri(v(-1, -1, 1, green), v(1, -1, 1, green), v(1, 1, 1, green)),
    ];

    const frame = renderFrame({
      width: 17,
      height: 17,
      triangles,
      camera: identityCamera,
      centerX: 8.5,
      centerY: 8.5,
    });

    expect(frame.id[8 * 17 + 8]).toBe(1);
    // Exact top edge belongs to triangle 0.
    expect(frame.id[0 * 17 + 8]).toBe(0);
    // Exact bottom edge belongs to neither triangle.
    expect(frame.id[16 * 17 + 8]).toBe(EMPTY_TRIANGLE_ID);

    // A second pair is split at the exact vertical pixel-center line x=8.5.
    // The shared edge belongs to the right-hand triangle; its left complement
    // is excluded so no pixel is rasterized twice.
    const verticalSplit = [
      tri(v(-2, -1, 1, red), v(0, 1, 1, red), v(-2, 1, 1, red)),
      tri(v(0, 1, 1, green), v(0, -1, 1, green), v(2, 1, 1, green)),
    ];
    const verticalFrame = renderFrame({
      width: 17,
      height: 17,
      triangles: verticalSplit,
      camera: identityCamera,
      centerX: 8.5,
      centerY: 8.5,
    });
    expect(verticalFrame.id[4 * 17 + 8]).toBe(1);
    expect(verticalFrame.id[2 * 17 + 5]).toBe(0);
    expect(verticalFrame.id[2 * 17 + 10]).toBe(1);
  });

  it('resolves overlap with the depth buffer regardless of submission order', () => {
    const camera: Camera = { ...identityCamera, focalLength: 2 };
    const far = (x: number, y: number) => v(x * 3, y * 3, 9, red);
    const near = (x: number, y: number) => v(x, y, 3, green);

    // Deliberately submit the near triangle first; the far triangle still loses.
    const triangles = [
      tri(near(-1.5, 1.5), near(3, 0), near(-1.5, -1.5)),
      tri(far(-1.5, 1.5), far(3, 0), far(-1.5, -1.5)),
    ];

    const frame = renderFrame({
      width: 5,
      height: 5,
      triangles,
      camera,
      centerX: 2.5,
      centerY: 2.5,
    });

    expect(pixel(frame, 2, 2)).toMatchObject({
      rgba: [0, 255, 0, 255],
      depth: 3,
      id: 0,
    });
  });
});

describe('render Worker protocol', () => {
  it('returns transferred-style buffers produced by the sole render path', () => {
    const response = createRenderResponse({
      kind: 'render',
      frameId: 7,
      width: 5,
      height: 5,
      triangles: [tri(v(-2, 2, 1, red), v(2, 2, 1, green), v(0, -2, 1, blue))],
      camera: { ...identityCamera, focalLength: 2 },
      centerX: 2.5,
      centerY: 2.5,
    });

    expect(response.frameId).toBe(7);
    expect(new Int32Array(response.id)[2 * 5 + 2]).toBe(0);
    expect(new Float32Array(response.depth)[2 * 5 + 2]).toBe(1);
  });
});

describe('frame ordering', () => {
  it('does not let an old camera or old size replace the committed frame', () => {
    const state = new FrameStateManager();
    const firstId = state.startFrame(10, 8);
    const secondId = state.startFrame(20, 12);

    const renderFor = (frameId: number, width: number, height: number) => {
      const result = renderFrame({
        width,
        height,
        triangles: [tri(v(-2, 2, 1, red), v(2, 2, 1, red), v(0, -2, 1, red))],
        camera: { ...identityCamera, focalLength: 2 },
        centerX: width / 2,
        centerY: height / 2,
      });
      return {
        frameId,
        width,
        height,
        color: result.color.buffer,
        depth: result.depth.buffer,
        id: result.id.buffer,
      };
    };

    // The late frame arrives first and must be rejected.
    expect(state.commitResponse(renderFor(firstId, 10, 8))).toBeNull();

    const current = state.commitResponse(renderFor(secondId, 20, 12));
    expect(current?.frameId).toBe(secondId);
    expect(state.pick(10, 6)).toBe(0);

    // Another duplicate response for the stale camera also cannot replace data.
    expect(state.commitResponse(renderFor(firstId, 10, 8))).toBeNull();
    expect(state.currentFrame?.width).toBe(20);
    expect(state.currentFrame?.height).toBe(12);
  });

  it('invalidates committed picking data after resize until the new frame commits', () => {
    const state = new FrameStateManager();
    const first = state.startFrame(5, 5);
    const response = createRenderResponse({
      kind: 'render',
      frameId: first,
      width: 5,
      height: 5,
      triangles: [tri(v(-2, 2, 1, red), v(2, 2, 1, red), v(0, -2, 1, red))],
      camera: { ...identityCamera, focalLength: 2 },
      centerX: 2.5,
      centerY: 2.5,
    });
    state.commitResponse(response);
    expect(state.pick(2, 2)).toBe(0);

    state.startFrame(8, 6);
    expect(state.isCurrentRequest(first, 5, 5)).toBe(false);
    // Picking is unavailable for the new canvas size until that frame commits.
    expect(state.pick(2, 2)).toBe(EMPTY_TRIANGLE_ID);
  });
});

describe('camera', () => {
  it('creates an orbit camera at negative Z looking toward +Z', () => {
    const camera = createOrbitCamera({ distance: 5, focalLength: 10 });
    expect(camera.position).toEqual({ x: 0, y: 0, z: -5 });
    expect(camera.forward).toMatchObject({ z: 1 });
    expect(camera.right).toMatchObject({ x: 1 });
    expect(camera.up).toMatchObject({ y: 1 });
    expect(transformToCamera({ x: 1, y: 2, z: 8 }, camera)).toMatchObject({ x: 1, y: 2, z: 13 });
    expect(transformToCamera({ x: 1, y: 2, z: 2 }, camera)).toMatchObject({ x: 1, y: 2, z: 7 });
  });
});

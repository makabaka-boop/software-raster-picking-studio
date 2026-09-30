import { describe, expect, it } from 'vitest';
import { commitResponse, createFrameState } from '../src/frame';
import type { RenderResponse } from '../src/types';

const response = (seq: number, width: number, height: number, id: number): RenderResponse => {
  const count = width * height;
  return {
    type: 'frame',
    seq,
    width,
    height,
    colors: new Uint8ClampedArray(count * 4),
    depth: new Float32Array(count),
    primitiveId: new Int32Array(count).fill(id),
  };
};

describe('stale worker frame competition', () => {
  it('commits a current rotation response and then rejects a late response', () => {
    const state = createFrameState(2, 2);
    state.seq = 1;

    expect(commitResponse(state, response(1, 2, 2, 11))).toBe(true);
    expect(state.frame?.primitiveId[0]).toBe(11);

    // User rotates before old frame 1 finishes rendering.
    state.seq = 2;
    const late = response(1, 2, 2, 99);
    expect(commitResponse(state, late)).toBe(false);
    expect(state.frame?.seq).toBe(1);
    expect(state.frame?.primitiveId[0]).toBe(11);

    expect(commitResponse(state, response(2, 2, 2, 22))).toBe(true);
    expect(state.frame?.primitiveId[0]).toBe(22);
  });

  it('rejects an in-sequence frame with stale resize dimensions', () => {
    const state = createFrameState(3, 2);
    state.seq = 2;

    // Frame seq 2 was generated before resize; current state already has 3x2.
    expect(commitResponse(state, response(2, 2, 2, 10))).toBe(false);
    expect(state.frame).toBe(null);

    expect(commitResponse(state, response(2, 3, 2, 20))).toBe(true);
    expect(state.frame?.width).toBe(3);
  });
});

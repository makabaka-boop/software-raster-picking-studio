import { renderFrame } from './renderer';
import type { WorkerRenderRequestMessage, WorkerRenderResponseMessage } from './types';

/**
 * Pure message handler. Keeping it outside `onmessage` lets the Worker protocol
 * be tested without spawning a browser Worker.
 */
export function createRenderResponse(message: WorkerRenderRequestMessage): WorkerRenderResponseMessage {
  if (message.kind !== 'render') {
    throw new Error(`Unsupported Worker message: ${String((message as { kind?: unknown }).kind)}`);
  }

  const result = renderFrame({
    width: message.width,
    height: message.height,
    triangles: message.triangles,
    camera: message.camera,
    centerX: message.centerX,
    centerY: message.centerY,
    background: message.background,
  });

  return {
    kind: 'rendered',
    frameId: message.frameId,
    width: result.width,
    height: result.height,
    color: result.color.buffer,
    depth: result.depth.buffer,
    id: result.id.buffer,
  };
}

if (typeof self !== 'undefined' && typeof (self as { postMessage?: unknown }).postMessage === 'function') {
  self.onmessage = (event: MessageEvent<WorkerRenderRequestMessage>) => {
    const response = createRenderResponse(event.data);
    self.postMessage(response, [response.color, response.depth, response.id]);
  };
}

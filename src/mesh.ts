import type { Rgba, Triangle, Vec3, Vertex } from './types';

function vertex(x: number, y: number, z: number, color: Rgba): Vertex {
  return { position: { x, y, z }, color };
}

function triangle(a: Vertex, b: Vertex, c: Vertex): Triangle {
  return { a, b, c };
}

export function createCubeMesh(size = 1): Triangle[] {
  const h = size / 2;
  const red: Rgba = { r: 235, g: 70, b: 70 };
  const green: Rgba = { r: 80, g: 210, b: 110 };
  const blue: Rgba = { r: 80, g: 140, b: 240 };
  const yellow: Rgba = { r: 235, g: 210, b: 80 };
  const magenta: Rgba = { r: 210, g: 90, b: 210 };
  const cyan: Rgba = { r: 80, g: 220, b: 220 };

  const p = (x: number, y: number, z: number): Vec3 => ({ x: x * h, y: y * h, z: z * h });
  const v = (position: Vec3, color: Rgba): Vertex => vertex(position.x, position.y, position.z, color);

  const faces: Array<{ points: [Vec3, Vec3, Vec3, Vec3]; color: Rgba }> = [
    { points: [p(-1, -1, 1), p(1, -1, 1), p(1, 1, 1), p(-1, 1, 1)], color: cyan },
    { points: [p(1, -1, -1), p(-1, -1, -1), p(-1, 1, -1), p(1, 1, -1)], color: blue },
    { points: [p(-1, 1, 1), p(1, 1, 1), p(1, 1, -1), p(-1, 1, -1)], color: green },
    { points: [p(-1, -1, -1), p(1, -1, -1), p(1, -1, 1), p(-1, -1, 1)], color: yellow },
    { points: [p(1, -1, 1), p(1, -1, -1), p(1, 1, -1), p(1, 1, 1)], color: red },
    { points: [p(-1, -1, -1), p(-1, -1, 1), p(-1, 1, 1), p(-1, 1, -1)], color: magenta },
  ];

  return faces.flatMap((face) => {
    const a = v(face.points[0], face.color);
    const b = v(face.points[1], face.color);
    const c = v(face.points[2], face.color);
    const d = v(face.points[3], face.color);
    return [triangle(a, b, c), triangle(a, c, d)];
  });
}

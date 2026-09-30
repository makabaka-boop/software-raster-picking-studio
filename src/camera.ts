import type { Camera, OrbitOptions, Vec3 } from './types';

function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function length(v: Vec3): number {
  return Math.hypot(v.x, v.y, v.z);
}

function normalize(v: Vec3): Vec3 {
  const len = length(v);
  if (!Number.isFinite(len) || len < 1e-12) {
    throw new Error('Camera direction must be a finite, non-zero vector');
  }
  return scale(v, 1 / len);
}

/**
 * Builds an orbit camera. The default looks from -Z toward the origin along
 * world +Z, matching the renderer's camera-space +Z projection axis.
 */
export function createOrbitCamera(options: OrbitOptions = {}): Camera {
  const target = options.target ?? { x: 0, y: 0, z: 0 };
  const distance = options.distance ?? 5;
  const focalLength = options.focalLength ?? Math.min(320, 240);
  const yaw = options.yaw ?? 0;
  // Keep away enough from the poles that the right/up basis remains stable.
  const pitchLimit = Math.PI / 2 - 1e-5;
  const pitch = clamp(options.pitch ?? 0, -pitchLimit, pitchLimit);

  if (!Number.isFinite(distance) || distance <= 0) {
    throw new Error('Camera distance must be a positive finite number');
  }
  if (!Number.isFinite(focalLength) || focalLength <= 0) {
    throw new Error('Camera focal length must be a positive finite number');
  }

  const cp = Math.cos(pitch);
  const offset: Vec3 = {
    x: distance * Math.sin(yaw) * cp,
    y: distance * Math.sin(pitch),
    z: -distance * Math.cos(yaw) * cp,
  };
  const position = add(target, offset);
  const forward = normalize(subtract(target, position));

  const worldUp: Vec3 = { x: 0, y: 1, z: 0 };
  let right = normalize(cross(worldUp, forward));
  let up = normalize(cross(forward, right));

  // Re-orthogonalize once to keep hand calculations and tests well-conditioned.
  right = normalize(subtract(right, scale(forward, dot(right, forward))));
  up = normalize(subtract(up, scale(forward, dot(up, forward))));
  up = normalize(subtract(up, scale(right, dot(up, right))));

  return { position, right, up, forward, focalLength };
}

export function transformToCamera(world: Vec3, camera: Camera): Vec3 {
  const v = subtract(world, camera.position);
  return {
    x: dot(v, camera.right),
    y: dot(v, camera.up),
    z: dot(v, camera.forward),
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

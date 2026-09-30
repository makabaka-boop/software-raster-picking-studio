import './style.css';
import { createOrbitCamera } from './camera';
import { createCubeMesh } from './mesh';
import { MeshViewer } from './viewer';

const canvas = document.querySelector<HTMLCanvasElement>('#canvas');
const info = document.querySelector<HTMLElement>('#info');
const smallButton = document.querySelector<HTMLButtonElement>('#small');
const largeButton = document.querySelector<HTMLButtonElement>('#large');
const pauseButton = document.querySelector<HTMLButtonElement>('#pause');

if (!canvas || !info || !smallButton || !largeButton || !pauseButton) {
  throw new Error('Demo DOM is incomplete');
}

const mesh = createCubeMesh(1.6);
const viewer = new MeshViewer(canvas, { width: 320, height: 240 });
viewer.setMesh(mesh);

let yaw = 0.4;
let pitch = -0.18;
let distance = 4.2;
let paused = false;
let dragging = false;
let lastX = 0;
let lastY = 0;

function updateCamera(): void {
  viewer.setCamera(createOrbitCamera({ yaw, pitch, distance, focalLength: 180 }));
}

canvas.addEventListener('pointerdown', (event) => {
  dragging = true;
  lastX = event.clientX;
  lastY = event.clientY;
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener('pointermove', (event) => {
  if (dragging) {
    yaw += (event.clientX - lastX) * 0.01;
    pitch = Math.max(-1.45, Math.min(1.45, pitch + (event.clientY - lastY) * 0.01));
    lastX = event.clientX;
    lastY = event.clientY;
    updateCamera();
  }
});

window.addEventListener('pointerup', () => {
  dragging = false;
});

canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  distance = Math.max(1.25, Math.min(10, distance + event.deltaY * 0.003));
  updateCamera();
}, { passive: false });

canvas.addEventListener('click', (event) => {
  const id = viewer.pick(event.clientX, event.clientY);
  info.textContent = id < 0 ? '拾取：背景' : `拾取：原始三角形 ID ${id}`;
});

smallButton.addEventListener('click', () => viewer.resize(320, 240));
largeButton.addEventListener('click', () => viewer.resize(640, 480));
pauseButton.addEventListener('click', () => {
  paused = !paused;
  pauseButton.textContent = paused ? '继续旋转' : '暂停旋转';
});

updateCamera();

function animate(): void {
  if (!paused && !dragging) {
    yaw += 0.004;
    updateCamera();
  }
  requestAnimationFrame(animate);
}
animate();

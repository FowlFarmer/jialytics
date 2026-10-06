import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { createPetalField, seededRandom } from './field';

// The falling petals and their wind on a transparent canvas. The mouse stirs them; on touch, a
// tap on the background bursts them. Loaded on demand, so three.js is only fetched for this.
const FOV = 43;

export default function PetalFall() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    } catch {
      return undefined; // No WebGL: the sky alone is fine.
    }
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const lowPower = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 720;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 80);
    const petals = createPetalField(seededRandom(), lowPower ? 80 : 205);
    const wind = petals.userData.wind as ReturnType<typeof import('./wind').createPetalWind>;
    const uniforms = (petals.material as THREE.ShaderMaterial).uniforms;
    uniforms.uTanHalfFov.value = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    scene.add(petals);

    const resize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight, false);
    };
    resize();

    const handlePointerMove = (event: PointerEvent) => {
      if (reduceMotion || event.pointerType !== 'mouse') return;
      const x = (event.clientX / window.innerWidth - 0.5) * 2;
      const y = (event.clientY / window.innerHeight - 0.5) * 2;
      wind.move(x, -y, performance.now() / 1000, camera.aspect);
    };
    const handlePointerLeave = () => wind.leave();
    let tap: { id: number; x: number; y: number; at: number } | null = null;
    const handleTapStart = (event: PointerEvent) => {
      tap = null;
      if (reduceMotion || !event.isPrimary || event.pointerType !== 'touch') return;
      if ((event.target as Element | null)?.closest?.('a, button, input, .jl-card')) return;
      tap = { id: event.pointerId, x: event.clientX, y: event.clientY, at: performance.now() };
    };
    const handleTapEnd = (event: PointerEvent) => {
      const start = tap;
      tap = null;
      if (
        !start ||
        event.pointerId !== start.id ||
        performance.now() - start.at > 350 ||
        Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10
      )
        return;
      wind.burst((event.clientX / window.innerWidth) * 2 - 1, 1 - (event.clientY / window.innerHeight) * 2, camera.aspect);
    };

    const startTime = performance.now();
    let lastFrame = startTime;
    let frame = 0;
    const render = (now: number) => {
      frame = window.requestAnimationFrame(render);
      const time = reduceMotion ? 0.5 : (now - startTime) / 1000;
      if (!reduceMotion && wind.step((now - lastFrame) / 1000, time, camera.aspect)) {
        petals.geometry.attributes.aWindMotion.needsUpdate = true;
      }
      lastFrame = now;
      uniforms.uTime.value = time;
      uniforms.uAspect.value = camera.aspect;
      renderer.render(scene, camera);
    };
    const handleVisibility = () => {
      window.cancelAnimationFrame(frame);
      if (!document.hidden) {
        lastFrame = performance.now();
        frame = window.requestAnimationFrame(render);
      }
    };
    frame = window.requestAnimationFrame(render);

    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', handlePointerLeave);
    window.addEventListener('pointerdown', handleTapStart, { passive: true });
    window.addEventListener('pointerup', handleTapEnd, { passive: true });
    window.addEventListener('pointercancel', handlePointerLeave);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', handlePointerMove);
      document.documentElement.removeEventListener('pointerleave', handlePointerLeave);
      window.removeEventListener('pointerdown', handleTapStart);
      window.removeEventListener('pointerup', handleTapEnd);
      window.removeEventListener('pointercancel', handlePointerLeave);
      document.removeEventListener('visibilitychange', handleVisibility);
      petals.geometry.dispose();
      (petals.material as THREE.Material).dispose();
      renderer.dispose();
    };
  }, []);

  return <canvas ref={canvasRef} className="jl-petals" aria-hidden="true" />;
}

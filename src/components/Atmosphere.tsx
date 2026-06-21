import { useEffect, useRef } from "react";

const MOTE_COUNT = 28;

interface Mote {
  x: number;   // 0–100 vw %
  y: number;   // 0–100 vh %
  r: number;   // radius px
  opacity: number;
  dx: number;  // px/s
  dy: number;  // px/s
  drift: number; // horizontal sine amplitude
  driftSpeed: number;
  driftOffset: number;
}

function makeMote(): Mote {
  return {
    x: Math.random() * 100,
    y: Math.random() * 100,
    r: 0.8 + Math.random() * 1.4,
    opacity: 0.08 + Math.random() * 0.18,
    dx: (Math.random() - 0.5) * 6,
    dy: -(2 + Math.random() * 5),   // drift upward
    drift: 10 + Math.random() * 20,
    driftSpeed: 0.3 + Math.random() * 0.5,
    driftOffset: Math.random() * Math.PI * 2,
  };
}

export default function Atmosphere() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const motesRef = useRef<Mote[]>(Array.from({ length: MOTE_COUNT }, makeMote));
  const rafRef = useRef(0);
  const lastRef = useRef(0);
  const tRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const step = (now: number) => {
      rafRef.current = requestAnimationFrame(step);
      const dt = Math.min((now - lastRef.current) / 1000, 0.1);
      lastRef.current = now;
      tRef.current += dt;

      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      for (const m of motesRef.current) {
        // Apply drift
        m.y += m.dy * dt;
        const sineDrift = Math.sin(tRef.current * m.driftSpeed + m.driftOffset) * m.drift * dt;
        m.x += m.dx * dt + sineDrift;

        // Wrap around edges
        if (m.y < -4) { m.y = 104; m.x = Math.random() * 100; }
        if (m.x < -2) m.x = 102;
        if (m.x > 102) m.x = -2;

        const px = (m.x / 100) * W;
        const py = (m.y / 100) * H;

        ctx.beginPath();
        ctx.arc(px, py, m.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 230, 160, ${m.opacity})`;
        ctx.fill();
      }
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <>
      {/* Vignette */}
      <div
        className="pointer-events-none fixed inset-0 z-[1]"
        style={{
          background:
            "radial-gradient(ellipse at 50% 50%, transparent 40%, rgba(0,0,0,0.55) 100%)",
        }}
      />

      {/* Dust motes canvas */}
      <canvas
        ref={canvasRef}
        className="pointer-events-none fixed inset-0 z-[1]"
      />
    </>
  );
}

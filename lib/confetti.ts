// Minimal canvas confetti — no dependency. One short burst, then self-removes.
export function burstConfetti() {
  if (typeof window === "undefined") return;
  const canvas = document.createElement("canvas");
  canvas.style.cssText =
    "position:fixed;inset:0;pointer-events:none;z-index:80";
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d")!;
  const colors = ["#e8643c", "#1f9d6b", "#15110c", "#f2b705", "#3b82f6"];
  const cx = canvas.width / 2;
  const parts = Array.from({ length: 140 }, () => ({
    x: cx,
    y: canvas.height * 0.28,
    vx: (Math.random() - 0.5) * 14,
    vy: Math.random() * -15 - 4,
    size: Math.random() * 7 + 4,
    color: colors[Math.floor(Math.random() * colors.length)],
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
    life: 1,
  }));

  let raf = 0;
  function frame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;
    for (const p of parts) {
      p.vy += 0.42; // gravity
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.life -= 0.009;
      if (p.life > 0 && p.y < canvas.height + 40) alive = true;
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    }
    if (alive) raf = requestAnimationFrame(frame);
    else canvas.remove();
  }
  raf = requestAnimationFrame(frame);
  setTimeout(() => {
    cancelAnimationFrame(raf);
    canvas.remove();
  }, 4000);
}

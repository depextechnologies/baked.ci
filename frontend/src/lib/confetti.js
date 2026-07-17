/**
 * Very small confetti burst — no library dependency.
 * Called on order confirmation for a mini celebration.
 */
export default function confetti(intensity = 0.5) {
  if (typeof document === "undefined") return;
  const colors = ["#77BC1F", "#FCC44C", "#1D9BF0", "#FF4C52", "#A659FF"];
  const count = Math.floor(80 * intensity);
  const container = document.createElement("div");
  container.style.cssText = "position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:9999";
  document.body.appendChild(container);

  for (let i = 0; i < count; i++) {
    const p = document.createElement("div");
    const size = 6 + Math.random() * 8;
    const c = colors[i % colors.length];
    p.style.cssText = `
      position:absolute;
      top:-20px;
      left:${Math.random() * 100}%;
      width:${size}px;height:${size * 0.5}px;
      background:${c};
      transform:rotate(${Math.random() * 360}deg);
      border-radius:2px;
      opacity:0.9;
      animation:confetti-fall ${2 + Math.random() * 2}s linear ${Math.random() * 0.6}s forwards;
    `;
    container.appendChild(p);
  }

  if (!document.getElementById("confetti-kf")) {
    const style = document.createElement("style");
    style.id = "confetti-kf";
    style.textContent = `@keyframes confetti-fall{
      0%{transform:translateY(0) rotate(0);opacity:1}
      100%{transform:translateY(105vh) rotate(720deg);opacity:0}
    }`;
    document.head.appendChild(style);
  }

  setTimeout(() => container.remove(), 4200);
}

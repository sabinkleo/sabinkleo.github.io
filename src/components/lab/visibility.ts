// Suspend animation and simulation updates when the instrument leaves the viewport.
export function whileVisible(root: HTMLElement, change: (active: boolean) => void) {
  let visible = false;
  const update = () => change(visible && !document.hidden);
  const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update(); });
  observer.observe(root.firstElementChild!);
  document.addEventListener('visibilitychange', update);
  root.addEventListener('astro:unmount', () => {
    observer.disconnect(); document.removeEventListener('visibilitychange', update); change(false);
  }, { once: true });
}

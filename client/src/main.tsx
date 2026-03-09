import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

const hideReplitBadge = () => {
  document.querySelectorAll('body > div').forEach(el => {
    const s = (el as HTMLElement).style;
    if (s.position === 'fixed' && s.zIndex && !el.id && !el.className) {
      (el as HTMLElement).style.display = 'none';
    }
  });
  document.querySelectorAll('body > iframe').forEach(el => {
    (el as HTMLElement).style.display = 'none';
  });
};
const badgeObserver = new MutationObserver(hideReplitBadge);
badgeObserver.observe(document.body, { childList: true });
setTimeout(hideReplitBadge, 1000);
setTimeout(hideReplitBadge, 3000);

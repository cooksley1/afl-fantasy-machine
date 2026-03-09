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
  document.querySelectorAll('body > iframe[src*="replit"], body > a[href*="replit"]').forEach(el => {
    (el as HTMLElement).style.setProperty('display', 'none', 'important');
  });
  document.querySelectorAll('[class*="agent-inbox"], [data-replit-feedback], .replit-ui-theme-root').forEach(el => {
    (el as HTMLElement).style.setProperty('display', 'none', 'important');
  });
};
const badgeObserver = new MutationObserver(hideReplitBadge);
badgeObserver.observe(document.body, { childList: true, subtree: false });
setTimeout(hideReplitBadge, 1000);
setTimeout(hideReplitBadge, 5000);

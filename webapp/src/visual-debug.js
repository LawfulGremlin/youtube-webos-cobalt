let debugBox = null;
let debugLines = [];

function getMountRoot() {
  return document.body || document.documentElement;
}

export function showVisualDebug(message) {
  const logMessage = `[ytaf-debug] ${message}`;
  try {
    if (typeof window !== 'undefined' && typeof window.ytafLog === 'function') {
      window.ytafLog(logMessage);
    }
  } catch (e) {
    // Keep visual diagnostics best-effort on older Cobalt builds.
  }

  try {
    console.info(logMessage);
  } catch (e) {
    // Keep visual diagnostics best-effort on older Cobalt builds.
  }

  const root = getMountRoot();
  if (!root) return;

  if (!debugBox || !document.contains(debugBox)) {
    debugBox = document.createElement('pre');
    debugBox.id = 'ytaf-visual-debug';
    debugBox.style.cssText = [
      'position:fixed',
      'left:24px',
      'top:24px',
      'z-index:2147483647',
      'max-width:86vw',
      'max-height:28vh',
      'overflow:hidden',
      'white-space:pre-wrap',
      'word-break:break-word',
      'margin:0',
      'padding:10px 12px',
      'background:rgba(0,0,0,0.86)',
      'border:2px solid #3ae676',
      'color:#d9ffe3',
      'font:18px/1.2 monospace',
      'pointer-events:none',
      'display:block'
    ].join(';');
    root.appendChild(debugBox);
  }

  debugLines.unshift(`${new Date().toISOString().substring(11, 19)} ${message}`);
  debugLines = debugLines.slice(0, 8);
  debugBox.textContent = debugLines.join('\n');
}

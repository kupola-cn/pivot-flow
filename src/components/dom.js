export function resolveTarget(target) {
  if (!target) {
    throw new Error('PIVOT Flow target is required.');
  }

  if (typeof target === 'string') {
    const element = globalThis.document?.querySelector(target);
    if (!element) {
      throw new Error(`PIVOT Flow target was not found: ${target}`);
    }
    return element;
  }

  return target;
}

export function createElement(tag, className, attrs = {}) {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }

  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null) {
      continue;
    }
    element.setAttribute(key, String(value));
  }

  return element;
}

export function escapeHTML(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function escapeAttr(value) {
  return escapeHTML(value).replaceAll('`', '&#96;');
}

export function on(root, event, selector, handler) {
  const listener = (e) => {
    const target = e.target.closest(selector);
    if (!target || !root.contains(target)) {
      return;
    }
    handler(e, target);
  };

  root.addEventListener(event, listener);
  return () => root.removeEventListener(event, listener);
}

export function formatJson(value) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return String(value);
  }
}

export function setHTML(target, html) {
  if (target) {
    target.innerHTML = html;
  }
}

export type PinViewport = {
  left: number;
  top: number;
  width: number;
  height: number;
  rotateDeg: number;
  transformOrigin: string;
};

function parseOriginPart(part: string, size: number) {
  if (!part || part === 'center') return size * 0.5;
  if (part.endsWith('%')) return (parseFloat(part) / 100) * size;
  const px = parseFloat(part);
  return Number.isFinite(px) ? px : size * 0.5;
}

export function parseTransformOrigin(originStr: string, width: number, height: number) {
  const parts = originStr.trim().split(/\s+/);
  return {
    x: parseOriginPart(parts[0] ?? 'center', width),
    y: parseOriginPart(parts[1] ?? 'center', height),
  };
}

/** Lokalny punkt canvasu → pozycja na ekranie (viewport). */
export function localToViewport(localX: number, localY: number, pin: PinViewport) {
  const origin = parseTransformOrigin(pin.transformOrigin || 'center center', pin.width, pin.height);
  const dx = localX - origin.x;
  const dy = localY - origin.y;

  if (Math.abs(pin.rotateDeg) < 0.05) {
    return { x: pin.left + localX, y: pin.top + localY };
  }

  const rad = (pin.rotateDeg * Math.PI) / 180;
  const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
  const ry = dx * Math.sin(rad) + dy * Math.cos(rad);
  return {
    x: pin.left + origin.x + rx,
    y: pin.top + origin.y + ry,
  };
}

/** Lokalny punkt canvasu → współrzędne dokumentu (przyklejone do tła strony). */
export function localToDocument(localX: number, localY: number, pin: PinViewport) {
  const vp = localToViewport(localX, localY, pin);
  return { x: vp.x + window.scrollX, y: vp.y + window.scrollY };
}

/** Dokument → lokalny punkt w SVG. */
export function documentToLocal(docX: number, docY: number, pin: PinViewport) {
  return viewportToLocal(docX - window.scrollX, docY - window.scrollY, pin);
}

/** Viewport → lokalny punkt w SVG (odwrotność transformu pina). */
export function viewportToLocal(vpX: number, vpY: number, pin: PinViewport) {
  const origin = parseTransformOrigin(pin.transformOrigin || 'center center', pin.width, pin.height);

  if (Math.abs(pin.rotateDeg) < 0.05) {
    return { x: vpX - pin.left, y: vpY - pin.top };
  }

  const lx = vpX - pin.left - origin.x;
  const ly = vpY - pin.top - origin.y;
  const rad = (-pin.rotateDeg * Math.PI) / 180;
  const dx = lx * Math.cos(rad) - ly * Math.sin(rad);
  const dy = lx * Math.sin(rad) + ly * Math.cos(rad);
  return { x: origin.x + dx, y: origin.y + dy };
}

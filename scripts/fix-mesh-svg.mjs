import fs from 'node:fs';
import path from 'node:path';

function parseMatrix(transform) {
  const match = transform.match(
    /matrix\(([-0-9.]+)\s+([-0-9.]+)\s+([-0-9.]+)\s+([-0-9.]+)\s+([-0-9.]+)\s+([-0-9.]+)\)/,
  );
  if (!match) return null;
  return match.slice(1).map(Number);
}

function applyMatrix(matrix, x, y) {
  const [a, b, c, d, e, f] = matrix;
  return { x: a * x + c * y + e, y: b * x + d * y + f };
}

function parseCircles(svg) {
  const circles = [];
  const re = /<circle[^>]*\/?>/g;
  for (const tag of svg.match(re) ?? []) {
    const cx = Number(tag.match(/cx="([^"]+)"/)?.[1] ?? 0);
    const cy = Number(tag.match(/cy="([^"]+)"/)?.[1] ?? 0);
    const transform = tag.match(/transform="([^"]+)"/)?.[1] ?? '';
    const matrix = parseMatrix(transform);
    circles.push(matrix ? applyMatrix(matrix, cx, cy) : { x: cx, y: cy });
  }
  return circles;
}

function nearestCircle(circles, x, y) {
  let best = circles[0];
  let bestDistance = Infinity;
  for (const circle of circles) {
    const distance = Math.hypot(circle.x - x, circle.y - y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = circle;
    }
  }
  return best;
}

function fixLineTag(tag, circles) {
  const x1 = Number(tag.match(/x1="([^"]+)"/)?.[1]);
  const y1 = Number(tag.match(/y1="([^"]+)"/)?.[1]);
  const x2 = Number(tag.match(/x2="([^"]+)"/)?.[1]);
  const y2 = Number(tag.match(/y2="([^"]+)"/)?.[1]);
  if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2)) {
    return tag;
  }

  const start = nearestCircle(circles, x1, y1);
  const end = nearestCircle(circles, x2, y2);
  return tag
    .replace(/x1="[^"]+"/, `x1="${start.x.toFixed(3)}"`)
    .replace(/y1="[^"]+"/, `y1="${start.y.toFixed(3)}"`)
    .replace(/x2="[^"]+"/, `x2="${end.x.toFixed(3)}"`)
    .replace(/y2="[^"]+"/, `y2="${end.y.toFixed(3)}"`);
}

function fixSvg(content) {
  const circles = parseCircles(content);
  if (circles.length === 0) {
    throw new Error('No circles found in SVG.');
  }

  return content.replace(/<line[^>]*\/?>/g, (tag) => fixLineTag(tag, circles));
}

const input = process.argv[2];
if (!input) {
  console.error('Usage: node scripts/fix-mesh-svg.mjs <path/to/file.svg>');
  process.exit(1);
}

const filePath = path.resolve(input);
const svg = fs.readFileSync(filePath, 'utf8');
const fixed = fixSvg(svg);
fs.writeFileSync(filePath, fixed);
console.log(`Snapped line endpoints to circle centers in ${filePath}`);

"""Trace Figma-style bus mesh SVG from wireframe PNG (circles + lines only)."""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image


def skeletonize_cv(mask: np.ndarray) -> np.ndarray:
    img = (mask > 0).astype(np.uint8) * 255
    skel = np.zeros(img.shape, np.uint8)
    element = cv2.getStructuringElement(cv2.MORPH_CROSS, (3, 3))
    temp = img.copy()
    while True:
        eroded = cv2.erode(temp, element)
        opened = cv2.dilate(eroded, element)
        temp_sub = cv2.subtract(temp, opened)
        skel = cv2.bitwise_or(skel, temp_sub)
        temp = eroded
        if cv2.countNonZero(temp) == 0:
            break
    return skel > 0


def figma(v: float) -> float:
    return math.floor(v) + 0.5


def merge_points(
    points: list[tuple[float, float, str]],
    radius: float,
) -> list[tuple[float, float, str]]:
    merged: list[tuple[float, float, str]] = []
    for x, y, group in points:
        found = False
        for i, (mx, my, mg) in enumerate(merged):
            if mg != group:
                continue
            if math.hypot(x - mx, y - my) <= radius:
                merged[i] = ((mx + x) / 2, (my + y) / 2, mg)
                found = True
                break
        if not found:
            merged.append((x, y, group))
    return merged


def component_nodes(mask: np.ndarray, group: str, min_area: int, max_area: int) -> list[tuple[float, float, str]]:
    count, _, stats, centroids = cv2.connectedComponentsWithStats(mask)
    nodes: list[tuple[float, float, str]] = []
    for i in range(1, count):
        area = int(stats[i, cv2.CC_STAT_AREA])
        if area < min_area or area > max_area:
            continue
        x, y = centroids[i]
        nodes.append((float(x), float(y), group))
    return nodes


def nearest_node_index(nodes: list[tuple[float, float, str]], x: float, y: float, max_dist: float) -> int | None:
    best: int | None = None
    best_dist = max_dist
    for i, (nx, ny, _) in enumerate(nodes):
        dist = math.hypot(nx - x, ny - y)
        if dist < best_dist:
            best_dist = dist
            best = i
    return best


def build_line_mask(white_mask: np.ndarray, nodes: list[tuple[float, float, str]]) -> np.ndarray:
    line_mask = white_mask.copy()
    for x, y, _ in nodes:
        cv2.circle(line_mask, (int(round(x)), int(round(y))), 7, 0, -1)
    return line_mask


def edges_from_skeleton(
    line_mask: np.ndarray,
    nodes: list[tuple[float, float, str]],
) -> set[tuple[int, int]]:
    skel = skeletonize_cv(line_mask)
    ys, xs = np.nonzero(skel)
    pixel_set = set(zip(xs.tolist(), ys.tolist(), strict=False))

    neighbors = (
        (-1, -1), (0, -1), (1, -1),
        (-1, 0),           (1, 0),
        (-1, 1),  (0, 1),  (1, 1),
    )

    def degree(x: int, y: int) -> int:
        return sum((x + dx, y + dy) in pixel_set for dx, dy in neighbors)

    special: dict[tuple[int, int], int] = {}
    for x, y in pixel_set:
        if degree(x, y) != 2:
            idx = nearest_node_index(nodes, float(x), float(y), 14)
            if idx is not None:
                special[(x, y)] = idx

    for i, (nx, ny, _) in enumerate(nodes):
        best: tuple[int, int] | None = None
        best_dist = 14.0
        for x, y in pixel_set:
            dist = math.hypot(nx - x, ny - y)
            if dist < best_dist:
                best_dist = dist
                best = (x, y)
        if best is not None:
            special[best] = i

    edges: set[tuple[int, int]] = set()
    visited: set[tuple[int, int]] = set()

    def walk_from(start: tuple[int, int]) -> None:
        x, y = start
        prev: tuple[int, int] | None = None
        current = start
        start_idx = special.get(start)

        while True:
            visited.add(current)
            cx, cy = current
            next_pixels = [
                (cx + dx, cy + dy)
                for dx, dy in neighbors
                if (cx + dx, cy + dy) in pixel_set and (cx + dx, cy + dy) != prev
            ]

            if not next_pixels:
                break

            nxt = next_pixels[0]
            if len(next_pixels) > 1:
                for candidate in next_pixels:
                    if candidate not in visited:
                        nxt = candidate
                        break

            end_idx = special.get(nxt)
            if end_idx is not None and start_idx is not None and end_idx != start_idx:
                pair = (start_idx, end_idx) if start_idx < end_idx else (end_idx, start_idx)
                edges.add(pair)
                break

            prev, current = current, nxt
            if current in visited:
                break

    for pixel, _idx in list(special.items()):
        if pixel not in visited:
            walk_from(pixel)

    return edges


def main() -> int:
    if len(sys.argv) < 3:
        print("Usage: png-to-bus-mesh.py <input.png> <output.svg>")
        return 1

    src = Path(sys.argv[1])
    dst = Path(sys.argv[2])
    arr = np.array(Image.open(src).convert("RGBA"))
    h, w = arr.shape[:2]
    r, g, b, a = arr[..., 0], arr[..., 1], arr[..., 2], arr[..., 3]
    visible = a > 20

    red_mask = (visible & (r > 165) & (g < 120) & (b < 120)).astype(np.uint8) * 255
    white_mask = (
        visible & (r > 175) & (g > 175) & (b > 175) & (red_mask == 0)
    ).astype(np.uint8) * 255

    dot_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    dot_mask = cv2.morphologyEx(white_mask, cv2.MORPH_OPEN, dot_kernel)

    body = merge_points(component_nodes(dot_mask, "body", 20, 900), radius=8)
    lights = component_nodes(red_mask, "light", 120, 5000)
    lights.sort(key=lambda p: p[0])

    nodes = body + lights
    line_mask = build_line_mask(white_mask, nodes)
    edges = edges_from_skeleton(line_mask, nodes)

    circles: list[str] = []
    for x, y, group in nodes:
        if group == "body":
            circles.append(
                f'<circle cx="{figma(x):.1f}" cy="{figma(y):.1f}" r="6.5" fill="#D9D9D9"/>'
            )
        else:
            circles.append(
                f'<circle cx="{figma(x):.1f}" cy="{figma(y):.1f}" r="8" fill="#FF0000"/>'
            )

    lines: list[str] = []
    body_count = len(body)
    for i, j in sorted(edges):
        if i >= body_count or j >= body_count:
            continue
        x0, y0, _ = nodes[i]
        x1, y1, _ = nodes[j]
        lines.append(
            f'<line x1="{figma(x0):.3f}" y1="{figma(y0):.3f}" '
            f'x2="{figma(x1):.3f}" y2="{figma(y1):.3f}" stroke="white"/>'
        )

    svg = (
        f'<svg width="{w}" height="{h}" viewBox="0 0 {w} {h}" fill="none" '
        f'xmlns="http://www.w3.org/2000/svg">\n'
        + "\n".join(circles)
        + "\n"
        + "\n".join(lines)
        + "\n</svg>\n"
    )

    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(svg, encoding="utf-8")
    print(
        json.dumps(
            {
                "body_nodes": len(body),
                "light_nodes": len(lights),
                "edges": len(lines),
                "size": [w, h],
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

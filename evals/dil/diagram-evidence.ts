type Point = { readonly x: number; readonly y: number };
type Color = readonly [number, number, number, number];

interface Boundary {
  readonly element: Element;
  readonly rect: DOMRect;
  readonly parent: Element;
  readonly colors: readonly (Color | null)[];
  label: string;
}

const DIAGRAM = "svg[data-dil-svg]";
const LAYOUT = "[data-dil-layout]";
const ARROW = /[←↑→↓↔↕↖↗↘↙⇒⇐⇔➔➜➝➞➟➠➡⟶⟵⟷]|[─━]+|(?<=\s)—(?=\s)/gu;
const ICON_DIRECTION =
  /^lucide-(?:(?:arrow(?:-big|-long)?|chevrons?|move|corner)-(?:up|down|left|right)(?:-(?:up|down|left|right))?)(?:-icon)?$/;
const contains = (outer: DOMRect, inner: DOMRect, inset = 0) =>
  inner.left >= outer.left + inset &&
  inner.right <= outer.right - inset &&
  inner.top >= outer.top + inset &&
  inner.bottom <= outer.bottom - inset;

export interface DiagramEvidence {
  readonly labels: readonly string[];
  readonly connections: number;
  readonly directedConnections: number;
  readonly nesting: readonly string[];
  readonly colorPair: readonly string[];
}

/** Measure visible boundaries, labels, and connections in the rendered answer. */
export function diagramEvidence(root: HTMLElement): DiagramEvidence {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const pixel = canvas.getContext("2d", { willReadFrequently: true });
  if (!pixel) throw new Error("Cannot measure rendered colors");
  const palette = new Map<string, Color | null>();
  function color(css: string): Color | null {
    if (!palette.has(css)) {
      pixel?.clearRect(0, 0, 1, 1);
      if (!pixel) return null;
      pixel.fillStyle = "transparent";
      pixel.fillStyle = css;
      pixel.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = pixel.getImageData(0, 0, 1, 1).data;
      palette.set(css, a > 8 ? [r, g, b, a] : null);
    }
    return palette.get(css) ?? null;
  }

  const drawn = (element: Element) =>
    !element.closest("defs, marker") && element.checkVisibility({ opacityProperty: true, visibilityProperty: true });
  const normalize = (label: string) => label.replace(/\s+/gu, " ").trim();
  const surfaces: Boundary[] = [];
  const htmlSurfaces = new Map<Element, Boundary>();
  for (const element of root.querySelectorAll<HTMLElement>('[data-dil-layout="box"]')) {
    if (!drawn(element) || !element.parentElement) continue;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) continue;
    const fill = color(style.backgroundColor);
    const border = ["top", "right", "bottom", "left"].map((side) =>
      Number.parseFloat(style.getPropertyValue(`border-${side}-width`)) > 0 &&
      !["none", "hidden"].includes(style.getPropertyValue(`border-${side}-style`))
        ? color(style.getPropertyValue(`border-${side}-color`))
        : null,
    );
    if (fill || border.every(Boolean)) {
      const surface = { element, rect, parent: element.parentElement, colors: [fill, ...border], label: "" };
      surfaces.push(surface);
      htmlSurfaces.set(element, surface);
    }
  }

  const diagrams = [...root.querySelectorAll<SVGSVGElement>(DIAGRAM)].filter(drawn);
  for (const diagram of diagrams) {
    const shapes = [...diagram.querySelectorAll<SVGGeometryElement>("rect, circle, ellipse, polygon, path")]
      .filter(drawn)
      .flatMap((element) => {
        const css = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        if (rect.width < 8 || rect.height < 8) return [];
        const fill = color(css.fill);
        const stroke = Number.parseFloat(css.strokeWidth) > 0 ? color(css.stroke) : null;
        if (!fill && !stroke) return [];
        if (element instanceof SVGPathElement && !/[zZ]\s*$/u.test(element.getAttribute("d") ?? "")) return [];
        return [{ element, rect, parent: diagram, colors: [fill, stroke], label: "" }];
      })
      .sort((a, b) => a.rect.width * a.rect.height - b.rect.width * b.rect.height);
    for (const label of diagram.querySelectorAll("text")) {
      if (!drawn(label)) continue;
      const owner = shapes.find(({ rect }) => contains(rect, label.getBoundingClientRect(), -2));
      if (owner) owner.label = normalize(`${owner.label} ${label.textContent ?? ""}`);
    }
    surfaces.push(...shapes);
  }

  const textRuns: { value: string; scope: Element; arrow: boolean; rect: DOMRect }[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!(node instanceof Text)) continue;
    const element = node.parentElement;
    const scope = element?.closest(LAYOUT) ?? element;
    if (!element || !drawn(element) || element.closest(`${DIAGRAM}, pre`)) continue;
    if (node.data.trim()) {
      for (let parent: Element | null = element; parent && parent !== root; parent = parent.parentElement) {
        const board = htmlSurfaces.get(parent);
        if (!board) continue;
        board.label = normalize(`${board.label} ${node.data}`);
        break;
      }
    }
    if (!scope || !node.data.trim()) continue;
    let start = 0;
    const segments: { start: number; end: number; arrow: boolean }[] = [];
    for (const match of node.data.matchAll(ARROW)) {
      segments.push({ start, end: match.index, arrow: false });
      start = match.index + match[0].length;
      segments.push({ start: match.index, end: start, arrow: true });
    }
    segments.push({ start, end: node.length, arrow: false });
    for (const segment of segments) {
      const value = node.data.slice(segment.start, segment.end).trim();
      if (!value) continue;
      range.setStart(node, segment.start);
      range.setEnd(node, segment.end);
      for (const rect of range.getClientRects()) {
        if (rect.width && rect.height) textRuns.push({ value, scope, arrow: segment.arrow, rect });
      }
    }
  }

  const labeled = surfaces.filter(({ label }) => label);
  const nesting = labeled
    .flatMap((outer) => {
      const inner = labeled.find(
        (candidate) =>
          candidate !== outer &&
          contains(outer.rect, candidate.rect, 1) &&
          (outer.element.contains(candidate.element) ||
            (outer.parent === candidate.parent && outer.parent.matches(DIAGRAM))),
      );
      return inner ? [outer.label, inner.label] : [];
    })
    .slice(0, 2);
  const barSeries = new Map<Boundary, Boundary>();
  const seriesByLayout = new Map<Element, Map<string, Boundary>>();
  for (const fill of htmlSurfaces.values()) {
    const track = htmlSurfaces.get(fill.parent);
    const item = track?.parent;
    const group = item?.parentElement;
    const layout = item?.getAttribute("data-dil-layout");
    if (!track || !item || !group?.matches(LAYOUT) || !layout || !fill.colors[0]) continue;
    if (!contains(track.rect, fill.rect, -1)) continue;

    const horizontal = track.rect.width >= 2 * track.rect.height && Math.abs(fill.rect.height - track.rect.height) <= 1;
    const vertical = track.rect.height >= 2 * track.rect.width && Math.abs(fill.rect.width - track.rect.width) <= 1;
    if (!horizontal && !vertical) continue;

    const slot = Array.from(item.children).indexOf(track.element);
    const role = `${layout}:${slot}:${horizontal ? "horizontal" : "vertical"}`;
    let series = seriesByLayout.get(group);
    if (!series) {
      series = new Map();
      seriesByLayout.set(group, series);
    }
    const first = series.get(role) ?? fill;
    series.set(role, first);
    barSeries.set(fill, first);
  }

  const colorPair: string[] = [];
  for (const [index, a] of surfaces.entries()) {
    const series = barSeries.get(a);
    const b = surfaces.slice(index + 1).find(
      (b) =>
        (a.parent === b.parent || (series !== undefined && series === barSeries.get(b))) &&
        !contains(a.rect, b.rect) &&
        !contains(b.rect, a.rect) &&
        a.colors.some((paint, channel) => {
          const other = b.colors[channel];
          if (!paint || !other) return false;
          const [red, green, blue, alpha] = paint;
          const [rr, gg, bb, otherAlpha] = other;
          return Math.hypot(red - rr, green - gg, blue - bb) * (Math.min(alpha, otherAlpha) / 255) >= 18;
        }),
    );
    if (b) {
      colorPair.push(a.label || "图形 1", b.label || "图形 2");
      break;
    }
  }

  let connections = 0;
  let directedConnections = 0;
  const icons = [...root.querySelectorAll<SVGSVGElement>("svg.lucide")].flatMap((icon) => {
    const glyph = [...icon.classList].find((name) => ICON_DIRECTION.test(name));
    const scope = icon.closest(LAYOUT) ?? icon.parentElement;
    return glyph && scope && drawn(icon) ? [{ scope, rect: icon.getBoundingClientRect(), value: glyph }] : [];
  });
  for (const connector of [...textRuns.filter(({ arrow }) => arrow), ...icons]) {
    const { rect, value, scope } = connector;
    const vertical = /[↑↓↕]|(?:up|down)(?:-icon)?$/.test(value) && !/(?:up|down)-(?:left|right)/.test(value);
    const horizontal = !vertical;
    const coordinate = (box: DOMRect) => (horizontal ? (box.left + box.right) / 2 : (box.top + box.bottom) / 2);
    const cross = (box: DOMRect) => (horizontal ? (box.top + box.bottom) / 2 : (box.left + box.right) / 2);
    const flowScope = scope.closest('[data-dil-layout="row"],[data-dil-layout="col"]') ?? scope;
    const neighbors = textRuns.filter(
      (run) =>
        !run.arrow &&
        flowScope.contains(run.scope) &&
        Math.abs(cross(run.rect) - cross(rect)) <= (horizontal ? 14 : 48) &&
        Math.abs(coordinate(run.rect) - coordinate(rect)) <= 180,
    );
    if (
      neighbors.some((run) => coordinate(run.rect) < coordinate(rect)) &&
      neighbors.some((run) => coordinate(run.rect) > coordinate(rect))
    ) {
      connections++;
      if (!/^[─━—]+$/u.test(value)) directedConnections++;
    }
  }

  const arrowTip = (shape: SVGGeometryElement): Point | undefined => {
    const style = getComputedStyle(shape);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return;
    if (!color(style.fill) && (!color(style.stroke) || Number.parseFloat(style.strokeWidth) <= 0)) return;
    const length = shape.getTotalLength();
    if (!length) return;
    const points = Array.from({ length: 33 }, (_, index) => shape.getPointAtLength((length * index) / 32));
    for (const [x, y] of [
      [1, 0],
      [0, 1],
      [Math.SQRT1_2, Math.SQRT1_2],
      [Math.SQRT1_2, -Math.SQRT1_2],
    ]) {
      const projected = points.map((point) => ({
        point,
        along: point.x * x + point.y * y,
        across: -point.x * y + point.y * x,
      }));
      const min = Math.min(...projected.map(({ along }) => along));
      const max = Math.max(...projected.map(({ along }) => along));
      const band = (max - min) / 7;
      if (!band) continue;
      const ends = [
        projected.filter(({ along }) => along <= min + band),
        projected.filter(({ along }) => along >= max - band),
      ];
      const [start, end] = ends.map(
        (points) => Math.max(...points.map(({ across }) => across)) - Math.min(...points.map(({ across }) => across)),
      );
      if (start > band * 2 && end < start * 0.45) return ends[1].find(({ along }) => along === max)?.point;
      if (end > band * 2 && start < end * 0.45) return ends[0].find(({ along }) => along === min)?.point;
    }
  };

  for (const diagram of diagrams) {
    const nodes = labeled.filter(({ parent }) => parent === diagram);
    const maxGap = Math.max(12, Math.min(32, diagram.getBoundingClientRect().width * 0.04));
    const drawnHeads = [...diagram.querySelectorAll<SVGGeometryElement>("polygon, polyline, path")].flatMap((head) => {
      if (!drawn(head) || nodes.some(({ element }) => element === head)) return [];
      const rect = head.getBoundingClientRect();
      if (rect.width > maxGap * 1.5 || rect.height > maxGap * 1.5) return [];
      const matrix = head.getScreenCTM();
      const tip = matrix && arrowTip(head);
      return tip && matrix ? [{ head, rect, tip: new DOMPoint(tip.x, tip.y).matrixTransform(matrix) }] : [];
    });
    const endpoint = (point: Point) => {
      return nodes
        .flatMap((node) => {
          const { rect } = node;
          const dx = Math.max(rect.left - point.x, 0, point.x - rect.right);
          const dy = Math.max(rect.top - point.y, 0, point.y - rect.bottom);
          const distance = Math.hypot(dx, dy);
          if (distance > maxGap) return [];
          const edge = Math.min(
            Math.abs(rect.left - point.x),
            Math.abs(rect.right - point.x),
            Math.abs(rect.top - point.y),
            Math.abs(rect.bottom - point.y),
          );
          return [{ node, distance: distance + edge / 8 }];
        })
        .sort((a, b) => a.distance - b.distance)[0]?.node;
    };
    for (const line of diagram.querySelectorAll<SVGGeometryElement>("path, line, polyline")) {
      if (!drawn(line) || surfaces.some(({ element }) => element === line)) continue;
      const style = getComputedStyle(line);
      const matrix = line.getScreenCTM();
      const length = line.getTotalLength();
      if (!matrix || !length || !color(style.stroke) || Number.parseFloat(style.strokeWidth) <= 0) continue;
      const start = line.getPointAtLength(0).matrixTransform(matrix);
      const end = line.getPointAtLength(length).matrixTransform(matrix);
      const left = endpoint(start);
      const right = endpoint(end);
      if (!left || !right || left === right) continue;
      connections++;
      const usesMarker = [style.markerStart, style.markerEnd].some((reference) => {
        const id = /#([^"')]+)["']?\)$/u.exec(reference)?.[1];
        const marker = id ? document.getElementById(id) : null;
        return (
          marker?.localName === "marker" &&
          diagram.contains(marker) &&
          [...marker.querySelectorAll<SVGGeometryElement>("path, polyline, polygon")].some(arrowTip)
        );
      });
      const hasDrawnHead = drawnHeads.some(({ head, rect, tip }) => {
        if (head === line) return false;
        return [
          [start, end],
          [end, start],
        ].some(([outer, inner]) => {
          const gap = Math.hypot(outer.x - tip.x, outer.y - tip.y);
          const width = Math.max(rect.width, rect.height);
          const travelsOut = (tip.x - outer.x) * (outer.x - inner.x) + (tip.y - outer.y) * (outer.y - inner.y);
          return gap <= width && travelsOut >= -width && endpoint(tip) === endpoint(outer);
        });
      });
      if (usesMarker || hasDrawnHead) directedConnections++;
    }
  }
  return {
    labels: [...new Set(labeled.map(({ label }) => label.toLocaleLowerCase()))],
    connections,
    directedConnections,
    nesting,
    colorPair,
  };
}

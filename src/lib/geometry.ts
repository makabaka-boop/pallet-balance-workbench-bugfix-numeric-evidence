import type { EdgeInfo, Point, StabilityResult, Workspace } from './types';

/** 2D 叉积 (b-a) × (c-a)，正值表示 c 在有向边 a→b 的左侧 */
export function cross(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

export type PolygonErrorType =
  | 'too-few-points'
  | 'duplicate-vertex'
  | 'degenerate-edge'
  | 'clockwise-or-degenerate'
  | 'non-convex'
  | 'non-convex-self-intersecting';

export interface PolygonCheck {
  valid: boolean;
  error?: PolygonErrorType;
}

/**
 * 校验多边形是否为逆时针顺序的严格凸多边形。
 * 逐三元组检测重复/退化/非凸，再用全局同侧检测兜住自交星形多边形。
 */
export function checkStrictConvexCCW(polygon: Point[]): PolygonCheck {
  const n = polygon.length;
  if (n < 3) return { valid: false, error: 'too-few-points' };

  // 相邻顶点重复
  for (let i = 0; i < n; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % n];
    if (a.x === b.x && a.y === b.y) {
      return { valid: false, error: 'duplicate-vertex' };
    }
  }

  // 逐相邻三元组：严格凸且逆时针要求每个叉积严格为正
  for (let i = 0; i < n; i++) {
    const a = polygon[(i - 1 + n) % n];
    const b = polygon[i];
    const c = polygon[(i + 1) % n];
    const cr = cross(a, b, c);
    if (cr === 0) return { valid: false, error: 'degenerate-edge' };
    if (cr < 0) {
      // 出现右转：可能是顺时针，也可能是局部凹陷
      const allNegative = polygon.every((p, j) => {
        const q = polygon[(j + 1) % n];
        return cross(p, q, polygon[(j + 2) % n]) < 0;
      });
      return {
        valid: false,
        error: allNegative ? 'clockwise-or-degenerate' : 'non-convex',
      };
    }
  }

  // 全局同侧检测：每条有向边，其余所有顶点都必须严格在其左侧。
  // 五角星等自交多边形局部叉积可全为正，但会在此被拦截。
  for (let i = 0; i < n; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % n];
    for (let j = 0; j < n; j++) {
      if (j === i || j === (i + 1) % n) continue;
      if (cross(a, b, polygon[j]) <= 0) {
        return { valid: false, error: 'non-convex-self-intersecting' };
      }
    }
  }

  return { valid: true };
}

/**
 * 点 p 到有向边 a→b 的有符号距离。
 * 逆时针多边形内部为正，边上为 0，外部为负。不做任何舍入。
 */
export function signedDistanceToEdge(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return NaN;
  return cross(a, b, p) / length;
}

export interface WeightedCentroidResult {
  cog: Point;
  totalWeight: number;
  /**
   * 各件重量均为合法有限数、但合计超出双精度可表示范围（相加溢出）时为 true。
   * 此时 totalWeight 为 Infinity：重心由缩放重量计算、几何上仍有效，
   * 但合计重量无法可靠表达，调用方必须给出明确反馈，
   * 不能把未知合计量伪装成可审核的正常载荷。
   */
  totalWeightOverflow: boolean;
}

/**
 * 按重量加权的合成重心。
 * 常规量级直接求和；若中间和非有限（极端输入），改用最大重量缩放，避免溢出。
 * 合计重量是否溢出通过 totalWeightOverflow 显式上报。
 */
export function weightedCentroid(
  items: { weight: number; center: Point }[],
): WeightedCentroidResult {
  let sx = 0;
  let sy = 0;
  let sw = 0;
  for (const it of items) {
    sx += it.weight * it.center.x;
    sy += it.weight * it.center.y;
    sw += it.weight;
  }

  if (Number.isFinite(sx) && Number.isFinite(sy) && Number.isFinite(sw) && sw > 0) {
    return { cog: { x: sx / sw, y: sy / sw }, totalWeight: sw, totalWeightOverflow: false };
  }

  // 极端输入兜底：按最大重量缩放，重心仍可精确表达
  const maxW = items.reduce((m, it) => Math.max(m, it.weight), 0);
  sx = 0;
  sy = 0;
  sw = 0;
  for (const it of items) {
    const w = it.weight / maxW;
    sx += w * it.center.x;
    sy += w * it.center.y;
    sw += w;
  }
  const totalWeight = sw * maxW;
  return {
    cog: { x: sx / sw, y: sy / sw },
    totalWeight,
    totalWeightOverflow: !Number.isFinite(totalWeight),
  };
}

/**
 * 用一条向多边形内部平移 d 的半平面裁剪凸多边形（Sutherland–Hodgman）。
 * 保留半平面 cross(a,b,p)/|b-a| >= d，即平移边 a'→b' 的左侧。
 * 判定不做外扩容差：安全区只允许等于真实内缩区域。若保留向外容差，
 * 极小正余量（如边长 100、margin 1e-12）下原支承边会被留在安全区内，
 * 图形随即与 minDistance >= margin 的数值判定相互矛盾。
 */
function clipConvexPolygonByHalfPlane(poly: Point[], a: Point, b: Point, d: number): Point[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return poly;
  // 平移后的边起点：沿左法线方向移动 d
  const nx = -dy / len;
  const ny = dx / len;
  const ap: Point = { x: a.x + nx * d, y: a.y + ny * d };
  const bp: Point = { x: b.x + nx * d, y: b.y + ny * d };
  const side = (p: Point): number => cross(ap, bp, p);

  if (poly.length === 0) return poly;
  const out: Point[] = [];
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i];
    const prev = poly[(i - 1 + poly.length) % poly.length];
    const curSide = side(cur);
    const prevSide = side(prev);
    const curIn = curSide >= 0;
    const prevIn = prevSide >= 0;

    if (prevIn !== curIn) {
      // 求 prev→cur 与平移边的交点
      const denom = curSide - prevSide;
      if (denom !== 0) {
        const t = -prevSide / denom;
        out.push({
          x: prev.x + t * (cur.x - prev.x),
          y: prev.y + t * (cur.y - prev.y),
        });
      }
    }
    if (curIn) out.push(cur);
  }
  return out;
}

/** margin 内缩后的安全区域；margin 为 0 时直接返回原多边形 */
export function insetPolygon(polygon: Point[], margin: number): Point[] {
  if (margin === 0) return polygon;
  let region = polygon;
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    region = clipConvexPolygonByHalfPlane(
      region,
      polygon[i],
      polygon[(i + 1) % n],
      margin,
    );
    if (region.length === 0) break;
  }
  return region;
}

/**
 * 对一份合法工作区执行完整稳定性分析。
 * 距离判断、稳定性结论均使用未舍入值；返回结果同时驱动数值面板与 SVG。
 */
export function analyzeStability(ws: Workspace): StabilityResult {
  const { polygon, items, margin } = ws;
  const { cog, totalWeight, totalWeightOverflow } = weightedCentroid(items);
  const n = polygon.length;

  const edges: EdgeInfo[] = [];
  for (let i = 0; i < n; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % n];
    edges.push({
      index: i,
      a,
      b,
      signedDistance: signedDistanceToEdge(cog, a, b),
    });
  }

  // min 天然取第一条最危险边作为平局时的稳定结果
  const criticalEdge = edges.reduce((m, e) =>
    e.signedDistance < m.signedDistance ? e : m,
  );
  const minDistance = criticalEdge.signedDistance;
  const stable = minDistance >= margin;

  return {
    polygon,
    items,
    cog,
    totalWeight,
    totalWeightOverflow,
    edges,
    minDistance,
    criticalEdge,
    safeRegion: insetPolygon(polygon, margin),
    stable,
    margin,
    shortfall: stable ? 0 : margin - minDistance,
  };
}

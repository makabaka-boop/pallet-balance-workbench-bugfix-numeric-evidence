import { describe, expect, it } from 'vitest';
import {
  analyzeStability,
  insetPolygon,
  signedDistanceToEdge,
  weightedCentroid,
} from './geometry';
import { fmt, resolveForm } from './form';
import type { CargoItem, Point, Workspace } from './types';

/**
 * 验收用例：极小正余量、边界重心、微小短缺、大重量组合。
 * 核心要求：几何区域（safeRegion）、原始数值判定（minDistance >= margin）、
 * 可读指标（fmt）与导入/编辑结果（resolveForm）对同一输入表达一致结论；
 * 无法可靠表达的量（溢出合计重量）必须有明确反馈，不能伪装成正常载荷。
 */

const square100: Point[] = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];

function items(...spec: Array<[string, number, number, number]>): CargoItem[] {
  return spec.map(([id, weight, x, y]) => ({ id, weight, center: { x, y } }));
}

function ws(polygon: Point[], list: CargoItem[], margin = 0): Workspace {
  return { polygon, items: list, margin };
}

/** 区域每个顶点到多边形每条边的有符号距离的最小值 */
function minRegionDistance(region: Point[], polygon: Point[]): number {
  let m = Infinity;
  for (const p of region) {
    for (let i = 0; i < polygon.length; i++) {
      m = Math.min(
        m,
        signedDistanceToEdge(p, polygon[i], polygon[(i + 1) % polygon.length]),
      );
    }
  }
  return m;
}

describe('验收：极小正余量（支承边长 100，margin = 1e-12）', () => {
  const MARGIN = 1e-12;

  it('安全区真实内缩：不再贴在原支承边上', () => {
    const region = insetPolygon(square100, MARGIN);
    expect(region.length).toBe(4);
    const d = minRegionDistance(region, square100);
    // 严格为正（不贴边），且内缩量等于 margin（浮点噪声远小于 1e-12）
    expect(d).toBeGreaterThan(0);
    expect(d).toBeCloseTo(MARGIN, 12);
  });

  it('安全区每个顶点都满足到各边距离 >= margin（区域即约束集）', () => {
    const region = insetPolygon(square100, MARGIN);
    // 坐标量级 100 的双精度 ulp ≈ 1.4e-14，内缩表示误差不可能更小；
    // 该容差仍能识别“安全区贴在原边上（距离为 0）”的缺陷
    const FP_SLACK = 4e-14;
    for (const p of region) {
      for (let i = 0; i < square100.length; i++) {
        const d = signedDistanceToEdge(
          p,
          square100[i],
          square100[(i + 1) % square100.length],
        );
        expect(d).toBeGreaterThanOrEqual(MARGIN - FP_SLACK);
      }
    }
  });

  it('重心恰在支承边上：判 UNSTABLE，且重心不在安全区内（图与数一致）', () => {
    const r = analyzeStability(ws(square100, items(['a', 1, 50, 0]), MARGIN));
    // 原始数值判定
    expect(r.stable).toBe(false);
    expect(r.minDistance).toBe(0);
    expect(r.shortfall).toBe(MARGIN);
    // 关键边：底边 (0,0)→(100,0)
    expect(r.criticalEdge.index).toBe(0);
    // 几何区域：安全区不接触原边，边上的重心必然落在安全区外
    expect(r.safeRegion.length).toBeGreaterThanOrEqual(3);
    expect(minRegionDistance(r.safeRegion, square100)).toBeGreaterThan(0);
    expect(r.minDistance).toBeLessThan(MARGIN);
  });

  it('重心恰在 margin 边界上：判 STABLE，重心即在安全区边界上（图与数一致）', () => {
    const r = analyzeStability(ws(square100, items(['a', 1, 50, MARGIN]), MARGIN));
    expect(r.stable).toBe(true);
    expect(r.minDistance).toBe(MARGIN);
    expect(r.shortfall).toBe(0);
    expect(r.criticalEdge.index).toBe(0);
  });
});

describe('验收：边界重心（兼容性）', () => {
  it('零余量下重心恰在支承边上仍判 STABLE（既有行为不变）', () => {
    const r = analyzeStability(ws(square100, items(['a', 1, 50, 0]), 0));
    expect(r.stable).toBe(true);
    expect(r.minDistance).toBe(0);
    expect(r.shortfall).toBe(0);
    // margin 为 0 时安全区即原多边形（含边）
    expect(r.safeRegion).toBe(square100);
  });

  it('常规 margin 下重心恰在边界上判 STABLE（既有行为不变）', () => {
    const r = analyzeStability(ws(square100, items(['a', 1, 50, 10]), 10));
    expect(r.stable).toBe(true);
    expect(r.minDistance).toBe(10);
  });
});

describe('验收：微小短缺的可读指标', () => {
  it('非零 margin 与短缺不会被显示成 0（不出现“0 ＜ 0”假矛盾）', () => {
    const r = analyzeStability(ws(square100, items(['a', 1, 50, 0]), 1e-12));
    expect(r.stable).toBe(false);
    // 非零阈值与差额必须可见
    expect(fmt(r.margin)).not.toBe('0');
    expect(fmt(r.shortfall)).not.toBe('0');
    expect(fmt(r.margin)).toContain('e');
    expect(Number(fmt(r.shortfall))).toBeCloseTo(1e-12, 15);
    // 实际余量真为 0 时仍显示 0
    expect(fmt(r.minDistance)).toBe('0');
  });

  it('fmt：小于展示精度的非零值用科学计数法，常规值与零值不变', () => {
    expect(fmt(0)).toBe('0');
    expect(fmt(1e-12)).toBe('1.00e-12');
    expect(fmt(-3.5e-8)).toBe('-3.50e-8');
    expect(fmt(4e-7)).toBe('4.00e-7');
    expect(fmt(0.25)).toBe('0.25');
    expect(fmt(123456.789)).toBe('123456.789');
    expect(fmt(Number.POSITIVE_INFINITY)).toBe('—');
  });
});

describe('验收：大重量组合溢出', () => {
  const bigPair = items(['a', 1e308, 40, 50], ['b', 1e308, 60, 50]);

  it('两件合法有限重量相加溢出：重心与关键边仍有效，合计重量显式标记为不可表达', () => {
    const r = analyzeStability(ws(square100, bigPair, 0));
    // 重心按缩放重量计算，几何结论仍有效
    expect(Number.isFinite(r.cog.x)).toBe(true);
    expect(Number.isFinite(r.cog.y)).toBe(true);
    expect(r.cog.x).toBeCloseTo(50, 10);
    expect(r.cog.y).toBeCloseTo(50, 10);
    expect(r.stable).toBe(true);
    expect(r.criticalEdge.signedDistance).toBe(r.minDistance);
    // 合计重量：明确标记溢出，而非伪装成可审核的正常载荷
    expect(r.totalWeightOverflow).toBe(true);
    expect(Number.isFinite(r.totalWeight)).toBe(false);
    expect(fmt(r.totalWeight)).toBe('—');
  });

  it('weightedCentroid 直接上报溢出标记', () => {
    const r = weightedCentroid(bigPair);
    expect(r.totalWeightOverflow).toBe(true);
    expect(r.totalWeight).toBe(Number.POSITIVE_INFINITY);
    expect(r.cog.x).toBeCloseTo(50, 10);
  });

  it('编辑路径（resolveForm）对同一输入给出同一溢出结论，不撤销几何结论', () => {
    const res = resolveForm(square100, {
      margin: '0',
      items: [
        { id: 'a', weight: '1e308', x: '40', y: '50' },
        { id: 'b', weight: '1e308', x: '60', y: '50' },
      ],
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.result.totalWeightOverflow).toBe(true);
      expect(res.result.stable).toBe(true);
      expect(res.result.cog.x).toBeCloseTo(50, 10);
    }
  });

  it('未溢出的大重量与常规重量不标记溢出（兼容性）', () => {
    const single = weightedCentroid(items(['a', 1e308, 10, 20]));
    expect(single.totalWeightOverflow).toBe(false);
    expect(single.totalWeight).toBe(1e308);
    expect(single.cog).toEqual({ x: 10, y: 20 });

    const normal = analyzeStability(
      ws(square100, items(['a', 120, 40, 50], ['b', 80, 60, 50]), 10),
    );
    expect(normal.totalWeightOverflow).toBe(false);
    expect(normal.totalWeight).toBe(200);
  });
});

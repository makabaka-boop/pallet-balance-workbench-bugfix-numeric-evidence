import { analyzeStability } from './geometry';
import { COORD_BOUND } from './parse';
import type { StabilityResult, Workspace } from './types';

/** 编辑表单中的单行文本（未提交的原始输入也保留为字符串） */
export interface ItemDraft {
  id: string;
  weight: string;
  x: string;
  y: string;
}

export interface FormState {
  margin: string;
  items: ItemDraft[];
}

export function workspaceToForm(ws: Workspace): FormState {
  return {
    margin: String(ws.margin),
    items: ws.items.map((it) => ({
      id: it.id,
      weight: String(it.weight),
      x: String(it.center.x),
      y: String(it.center.y),
    })),
  };
}

export type ResolvedForm =
  | { ok: true; result: StabilityResult }
  | { ok: false; errors: string[] };

/**
 * 把当前编辑表单解析为工作区并立即执行稳定性分析。
 * 任何字段非法即判定失败，调用方据此撤销旧结论——
 * 数值面板与 SVG 只可能同时展示同一份成功结果，或同时不展示结论。
 */
export function resolveForm(polygon: Workspace['polygon'], form: FormState): ResolvedForm {
  const errors: string[] = [];

  let margin: number;
  const m = Number(form.margin);
  if (form.margin.trim() === '' || !Number.isFinite(m)) {
    errors.push('安全余量必须是有限数');
    margin = NaN;
  } else if (m < 0) {
    errors.push('安全余量必须是非负数');
    margin = m;
  } else {
    margin = m;
  }

  // 件数由导入环节保证（编辑界面不增删件）

  const items = form.items.map((d, i) => {
    const where = `货物 "${d.id || `#${i + 1}`}"`;
    const w = Number(d.weight);
    const x = Number(d.x);
    const y = Number(d.y);

    if (d.weight.trim() === '' || !Number.isFinite(w) || w <= 0) {
      errors.push(`${where}：重量必须为正数`);
    }
    if (d.x.trim() === '' || !Number.isFinite(x) || Math.abs(x) > COORD_BOUND) {
      errors.push(`${where}：X 必须是绝对值不超过 1e6 的有限数`);
    }
    if (d.y.trim() === '' || !Number.isFinite(y) || Math.abs(y) > COORD_BOUND) {
      errors.push(`${where}：Y 必须是绝对值不超过 1e6 的有限数`);
    }
    return { id: d.id, weight: w, center: { x, y } };
  });

  if (errors.length > 0) return { ok: false, errors };

  const workspace: Workspace = { polygon, items, margin };
  return { ok: true, result: analyzeStability(workspace) };
}

/** 展示用：最多保留 6 位小数；title 属性另行提供未舍入原值 */
export function fmt(n: number, digits = 6): string {
  if (!Number.isFinite(n)) return '—';
  const rounded = Number(n.toFixed(digits));
  return String(rounded);
}

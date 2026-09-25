/** 共享类型定义 */

export interface Point {
  x: number;
  y: number;
}

/** 单件货物 */
export interface CargoItem {
  id: string;
  weight: number;
  center: Point;
}

/** 已通过校验、可用于计算的工作区数据 */
export interface Workspace {
  /** 严格凸、逆时针排列的支撑多边形 */
  polygon: Point[];
  /** 1..200 件货物，id 唯一 */
  items: CargoItem[];
  /** 安全余量（非负） */
  margin: number;
}

/** 支撑多边形的一条边及其到某点的有符号距离 */
export interface EdgeInfo {
  index: number;
  a: Point;
  b: Point;
  /** 有符号距离：逆时针多边形内部为正 */
  signedDistance: number;
}

/** 稳定性计算结果（图形与数值共用同一份） */
export interface StabilityResult {
  /** 本次计算使用的支撑多边形 */
  polygon: Point[];
  /** 参与本次计算的货物（已通过校验） */
  items: CargoItem[];
  cog: Point;
  totalWeight: number;
  /**
   * 合计重量相加溢出（各件合法但总和超出双精度范围）时为 true。
   * 此时 totalWeight 不可作为审核放行依据，展示层必须给出明确反馈。
   */
  totalWeightOverflow: boolean;
  edges: EdgeInfo[];
  /** 重心到各支撑边的最小有符号距离（未舍入） */
  minDistance: number;
  /** 取得最小距离的边 */
  criticalEdge: EdgeInfo;
  /** margin 内缩后的安全区域（半平面裁剪结果），可能为空（塌缩） */
  safeRegion: Point[];
  stable: boolean;
  margin: number;
  /** 不稳定时相对 margin 的短缺量，稳定时为 0 */
  shortfall: number;
}

/** 表单解析结果 */
export type FormResult =
  | { ok: true; workspace: Workspace }
  | { ok: false; errors: string[] };

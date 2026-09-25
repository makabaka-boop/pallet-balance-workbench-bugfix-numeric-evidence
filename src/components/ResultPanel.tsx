import type { StabilityResult } from '../lib/types';
import { fmt } from '../lib/form';

interface Props {
  result: StabilityResult;
}

/**
 * 数值结论面板。全部数值直接来自传入的 StabilityResult，
 * 与 SVG 使用同一计算结果；边界判断使用未舍入值，
 * 展示值附带 title 提供原始精度。
 */
export default function ResultPanel({ result }: Props) {
  const { stable, cog, totalWeight, minDistance, margin, shortfall, criticalEdge, edges } =
    result;

  return (
    <section className={`panel verdict ${stable ? 'stable' : 'unstable'}`}>
      <div className="verdict-badge">{stable ? 'STABLE' : 'UNSTABLE'}</div>

      <dl className="metric-grid">
        <div>
          <dt>合成重心 X</dt>
          <dd title={String(cog.x)}>{fmt(cog.x)}</dd>
        </div>
        <div>
          <dt>合成重心 Y</dt>
          <dd title={String(cog.y)}>{fmt(cog.y)}</dd>
        </div>
        <div>
          <dt>总重量</dt>
          <dd title={String(totalWeight)}>{fmt(totalWeight)}</dd>
        </div>
        <div>
          <dt>最小有符号距离（实际余量）</dt>
          <dd className={stable ? 'pos' : 'neg'} title={String(minDistance)}>
            {fmt(minDistance)}
          </dd>
        </div>
        <div>
          <dt>要求安全余量 margin</dt>
          <dd title={String(margin)}>{fmt(margin)}</dd>
        </div>
        <div>
          <dt>{stable ? '富余' : '短缺量'}</dt>
          <dd className={stable ? 'pos' : 'neg'} title={String(stable ? minDistance - margin : shortfall)}>
            {fmt(stable ? minDistance - margin : shortfall)}
          </dd>
        </div>
      </dl>

      {!stable && (
        <div className="danger-box">
          <strong>最危险边：</strong>
          边 #{criticalEdge.index}（
          {`(${fmt(criticalEdge.a.x)}, ${fmt(criticalEdge.a.y)}) → (${fmt(
            criticalEdge.b.x,
          )}, ${fmt(criticalEdge.b.y)})`}
          ）
          <div className="danger-line">
            实际余量 {fmt(minDistance)} ＜ margin {fmt(margin)}，短缺 {fmt(shortfall)}
          </div>
          <div className="danger-note">
            距离为{minDistance < 0 ? '负，重心已越出该支撑边' : '正但不足 margin'}，
            叉运前必须重新配载。
          </div>
        </div>
      )}

      <details className="edge-details">
        <summary>各支撑边有符号距离（未舍入判断，展示保留 6 位小数）</summary>
        <table className="edge-table">
          <thead>
            <tr>
              <th>边</th>
              <th>起点</th>
              <th>终点</th>
              <th>有符号距离</th>
            </tr>
          </thead>
          <tbody>
            {edges.map((e) => (
              <tr
                key={e.index}
                className={e.index === criticalEdge.index ? 'critical' : ''}
              >
                <td>#{e.index}</td>
                <td>
                  ({fmt(e.a.x)}, {fmt(e.a.y)})
                </td>
                <td>
                  ({fmt(e.b.x)}, {fmt(e.b.y)})
                </td>
                <td title={String(e.signedDistance)}>{fmt(e.signedDistance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}

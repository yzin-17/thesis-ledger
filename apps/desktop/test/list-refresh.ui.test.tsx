// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { TableContainer } from '../src/components/ui/table';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('列表中央的刷新提示', () => {
  it('表格和滚动容器保持挂载，更新完成后移除加载圈', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const render = (refreshing: boolean, name: string) =>
      act(() =>
        root.render(
          <TableContainer refreshing={refreshing} refreshLabel="正在刷新成交记录">
            <table>
              <tbody>
                <tr>
                  <td>
                    <button>{name}</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </TableContainer>,
        ),
      );
    try {
      await render(false, '原成交');
      const row = host.querySelector('tr')!;
      const button = host.querySelector('button')!;
      const scroll = host.querySelector<HTMLElement>('[data-slot="table-container"]')!;
      button.focus();
      scroll.scrollLeft = 120;
      await render(true, '原成交');
      expect(host.querySelector('tr')).toBe(row);
      expect(row.textContent).toBe('原成交');
      expect(document.activeElement).toBe(button);
      expect(host.querySelector('[data-slot="table-container"]')).toBe(scroll);
      expect(scroll.scrollLeft).toBe(120);
      const region = scroll.parentElement!;
      expect(region.getAttribute('aria-busy')).toBe('true');
      expect(region.querySelector('[role="status"]')?.getAttribute('aria-label')).toBe(
        '正在刷新成交记录',
      );
      expect(scroll.contains(region.querySelector('[data-slot="list-refresh"]'))).toBe(false);
      await render(false, '新成交');
      expect(host.querySelector('tr')).toBe(row);
      expect(row.textContent).toBe('新成交');
      expect(region.querySelector('[data-slot="list-refresh"]')).toBeNull();
      expect(document.activeElement).toBe(button);
    } finally {
      await act(() => root.unmount());
      host.remove();
    }
  });
});

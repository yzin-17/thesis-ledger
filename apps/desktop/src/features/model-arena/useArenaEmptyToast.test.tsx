// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useArenaEmptyToast } from './useArenaEmptyToast.js';
const manager = vi.hoisted(() => ({ add: vi.fn<(value: unknown) => string>(() => 'arena-empty'), close: vi.fn() }));
vi.mock('@/components/ui/toast', () => ({ createToastManager: () => manager }));
let root: Root, host: HTMLDivElement, notice: ReturnType<typeof useArenaEmptyToast>;
const update = async (action: () => void) => { await act(async () => { action(); await Promise.resolve(); }); };
function Probe({ scope }: { scope: string }) { notice = useArenaEmptyToast(scope); return null; }
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.clearAllMocks(); host = document.createElement('div'); root = createRoot(host); });
afterEach(async () => { await update(() => root.unmount()); vi.unstubAllGlobals(); });
const render = (scope = 'owner:600036.SH:1d') => update(() => root.render(<Probe scope={scope} />));
describe('模型空结果 Toast 的主动操作边界', () => {
  it('恢复已开启图层或后台空结果不自动提示', async () => {
    await render(); await update(() => notice.report('empty'));
    expect(manager.add).not.toHaveBeenCalled();
  });
  it('主动开启后等待成功空结果，仅提示一次并使用固定 ID、3 秒和信息类型', async () => {
    await render(); await update(() => { notice.request(true); notice.report('pending'); });
    expect(manager.add).not.toHaveBeenCalled();
    await update(() => notice.report('empty'));
    expect(manager.add).toHaveBeenCalledWith({ id: 'arena-empty', title: '暂无包含此标的的比赛', type: 'info', timeout: 3000, priority: 'low' });
    await update(() => { notice.report('pending'); notice.report('empty'); notice.report('empty'); });
    expect(manager.add).toHaveBeenCalledTimes(1);
    await update(() => { notice.request(false); notice.request(true); notice.report('empty'); });
    expect(manager.add).toHaveBeenCalledTimes(2);
    expect(manager.add.mock.calls.map(([value]) => value)).toEqual([expect.objectContaining({ id: 'arena-empty' }), expect.objectContaining({ id: 'arena-empty' })]);
  });
  it.each(['ready', 'error'] as const)('%s 收敛主动请求后，后续空结果不再提示', async (status) => {
    await render(); await update(() => { notice.request(true); notice.report(status); notice.report('empty'); });
    expect(manager.add).not.toHaveBeenCalled();
  });
  it('关闭清理提示并拒绝迟到空结果', async () => {
    await render(); await update(() => { notice.request(true); notice.request(false); notice.report('empty'); });
    expect(manager.close).toHaveBeenCalledWith('arena-empty');
    expect(manager.add).not.toHaveBeenCalled();
  });
  it('周期、标的或身份作用域变化使旧的主动请求失效', async () => {
    await render(); await update(() => notice.request(true)); const oldReport = notice.report;
    await render('owner:600036.SH:1w'); await update(() => { oldReport('empty'); notice.report('empty'); });
    await render('other:510300.SH:1d'); await update(() => notice.report('empty'));
    expect(manager.add).not.toHaveBeenCalled();
    await update(() => { notice.request(true); notice.report('empty'); });
    expect(manager.add).toHaveBeenCalledTimes(1);
  });
});

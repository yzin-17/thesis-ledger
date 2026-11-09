export function chartOverlayHandlesEscape(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  if (target.closest('[data-chart-custom-range], [data-slot="popover-content"], [data-slot="hover-card-content"], [data-slot="dropdown-menu-content"], [data-slot="select-content"], [data-info-tip-trigger][aria-expanded="true"], [aria-haspopup][aria-expanded="true"]')) return true;
  const dialog = target.closest('[role="dialog"]');
  return Boolean(dialog && !dialog.querySelector('[data-market-nav-chart], [data-market-lightweight-chart]'));
}

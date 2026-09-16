import { PaletteIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { isMarketColorScheme, useMarketColorScheme } from '@/ui/market-color';

export function MarketColorMenu() {
  const { scheme, setScheme, storageError } = useMarketColorScheme();
  return (
    <div className="relative flex items-center">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              className="text-muted-foreground"
              aria-label="设置涨跌配色"
            >
              <PaletteIcon data-icon="inline-start" aria-hidden="true" />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-[240px]">
          <DropdownMenuGroup>
            <DropdownMenuLabel>涨跌配色</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={scheme}
              onValueChange={(value) => {
                if (typeof value === 'string' && isMarketColorScheme(value)) setScheme(value);
              }}
            >
              <DropdownMenuRadioItem value="red-up">
                <span className="inline-flex min-w-[172px] flex-col gap-0.5">
                  <span>红涨绿跌</span>
                  <span className="text-[10px] text-muted-foreground">
                    <span className="text-[var(--color-negative)]">↑ +1.23%</span> /{' '}
                    <span className="text-[var(--color-positive)]">↓ −1.23%</span>
                  </span>
                </span>
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="green-up">
                <span className="inline-flex min-w-[172px] flex-col gap-0.5">
                  <span>绿涨红跌</span>
                  <span className="text-[10px] text-muted-foreground">
                    <span className="text-[var(--color-positive)]">↑ +1.23%</span> /{' '}
                    <span className="text-[var(--color-negative)]">↓ −1.23%</span>
                  </span>
                </span>
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {storageError ? (
        <span
          className="absolute right-0 top-[calc(100%+4px)] z-[var(--z-toast)] w-max max-w-[240px] rounded-[5px] border border-[var(--color-error)] bg-[var(--color-error-soft)] px-2 py-1 text-[11px] text-[var(--color-error)]"
          role="status"
        >
          {storageError}
        </span>
      ) : null}
    </div>
  );
}

import { Input } from '@/components/ui/input';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '@/components/ui/input-group';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { InstrumentCombobox } from './InstrumentCombobox.js';
import { assetQuantityUnit, assetTypeLabel, instrumentAssetType } from './portfolio.types.js';
import type { HeldAssetType, InstrumentLookup, Position } from './portfolio.types.js';
import type { PortfolioManagementViewProps } from './PortfolioManagementView.types.js';

const positionAssetType = (
  selectedInstrument: InstrumentLookup | null,
  manualEntry: boolean,
  manualAssetType: HeldAssetType,
  editing: Position | null,
) => {
  if (selectedInstrument) return instrumentAssetType(selectedInstrument.instrumentType);
  if (manualEntry) return manualAssetType;
  return editing?.asset.assetType;
};

function ManualAssetTypeOptions({ manualAssetType }: { manualAssetType: HeldAssetType }) {
  if (manualAssetType === 'fund') return <SelectItem value="fund">基金</SelectItem>;
  return (
    <>
      <SelectItem value="stock">股票</SelectItem>
      <SelectItem value="etf">ETF</SelectItem>
    </>
  );
}

export function PositionFields({
  editing,
  instrumentQuery,
  instrumentResults,
  instrumentSearchState,
  instrumentSearchBusy,
  instrumentSearchOpen,
  selectedInstrument,
  manualInstrumentEntry,
  manualAssetType,
  setInstrumentSearchOpen,
  handleInstrumentQueryChange,
  confirmInstrument,
  clearInstrumentSelection,
  startManualInstrumentEntry,
  setManualAssetType,
}: Pick<
  PortfolioManagementViewProps,
  | 'editing'
  | 'instrumentQuery'
  | 'instrumentResults'
  | 'instrumentSearchState'
  | 'instrumentSearchBusy'
  | 'instrumentSearchOpen'
  | 'selectedInstrument'
  | 'manualInstrumentEntry'
  | 'manualAssetType'
  | 'confirmInstrument'
  | 'clearInstrumentSelection'
  | 'startManualInstrumentEntry'
  | 'setManualAssetType'
  | 'setInstrumentSearchOpen'
  | 'handleInstrumentQueryChange'
>) {
  return (
    <>
      <div className="grid gap-1.5">
        <span className="text-xs text-muted-foreground">标的</span>
        <InstrumentCombobox
          editing={editing}
          manualEntry={manualInstrumentEntry}
          open={instrumentSearchOpen}
          query={instrumentQuery}
          results={instrumentResults}
          searchState={instrumentSearchState}
          selectedInstrument={selectedInstrument}
          busy={instrumentSearchBusy}
          onClearSelection={clearInstrumentSelection}
          onManualEntry={startManualInstrumentEntry}
          onOpenChange={(open) => setInstrumentSearchOpen(open && Boolean(instrumentQuery.trim()))}
          onQueryChange={handleInstrumentQueryChange}
          onSelect={(instrument) => void confirmInstrument(instrument)}
          onStartSearch={() => {
            if (instrumentQuery.trim()) setInstrumentSearchOpen(true);
          }}
        />
      </div>
      {manualInstrumentEntry && (
        <div className="grid gap-4 rounded-md border border-border bg-muted/20 p-3">
          <label>
            名称
            <Input name="assetName" required maxLength={120} />
          </label>
          <label>
            类型
            <Select
              name="assetType"
              required
              value={manualAssetType}
              onValueChange={(value) => {
                if (value === 'stock' || value === 'etf' || value === 'fund')
                  setManualAssetType(value);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(value: string | null) => assetTypeLabel(value as HeldAssetType)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <ManualAssetTypeOptions manualAssetType={manualAssetType} />
                </SelectGroup>
              </SelectContent>
            </Select>
          </label>
        </div>
      )}
      <div className="grid gap-4 border-t border-border pt-4">
        <div className="text-sm font-semibold text-foreground">持仓信息</div>
        <label>
          当前数量
          <InputGroup className="h-10">
            <InputGroupInput
              className="h-10 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              name="quantity"
              required
              type="number"
              min="0"
              step="any"
              defaultValue={editing?.quantity}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupText>
                {assetQuantityUnit(
                  positionAssetType(
                    selectedInstrument,
                    manualInstrumentEntry,
                    manualAssetType,
                    editing,
                  ),
                  editing?.symbol,
                )}
              </InputGroupText>
            </InputGroupAddon>
          </InputGroup>
        </label>
        <label>
          平均成本
          <InputGroup className="h-10">
            <InputGroupInput
              className="h-10 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              name="costPrice"
              required
              type="number"
              min="0"
              step="any"
              defaultValue={editing?.costPrice}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupText>
                元/
                {assetQuantityUnit(
                  positionAssetType(
                    selectedInstrument,
                    manualInstrumentEntry,
                    manualAssetType,
                    editing,
                  ),
                  editing?.symbol,
                )}
              </InputGroupText>
            </InputGroupAddon>
          </InputGroup>
        </label>
      </div>
    </>
  );
}

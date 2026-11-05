import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  modelCatalogDraftFromConfig,
  type ModelCatalogDraft,
} from './ai-provider-model-catalog.js';
import type { ProviderDraft } from './providers.types.js';

const ruleOptions = [
  { value: 'default', label: '默认规则' },
  { value: 'manual', label: '手动配置' },
];
const filterOptions = [
  { value: 'none', label: '不筛选' },
  { value: 'equals', label: '按字段等值筛选' },
];
const paginationOptions = [
  { value: 'none', label: '不分页' },
  { value: 'page', label: '按页码分页' },
];
const stopOptions = [
  { value: 'empty-page', label: '返回空页时结束' },
  { value: 'short-page', label: '不足一页时结束' },
];

function CatalogChoice({
  id,
  label,
  value,
  items,
  onChange,
  description,
}: {
  id: string;
  label: string;
  value: string;
  items: { value: string; label: string }[];
  onChange: (value: string) => void;
  description?: string | undefined;
}) {
  return (
    <Field>
      <FieldLabel id={`${id}-label`}>{label}</FieldLabel>
      <ToggleGroup
        id={id}
        aria-labelledby={`${id}-label`}
        value={[value]}
        onValueChange={(next) => {
          if (next[0]) onChange(next[0]);
        }}
      >
        {items.map((item) => (
          <ToggleGroupItem key={item.value} type="button" value={item.value}>
            {item.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {description && <FieldDescription>{description}</FieldDescription>}
    </Field>
  );
}

function CatalogInput({
  id,
  label,
  value,
  onChange,
  description,
  placeholder,
  type = 'text',
  min,
  max,
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  description?: string;
  placeholder?: string;
  type?: 'text' | 'url' | 'number';
  min?: number;
  max?: number;
  required?: boolean;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        aria-label={label}
        value={value}
        type={type}
        min={min}
        max={max}
        required={required}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      {description && <FieldDescription>{description}</FieldDescription>}
    </Field>
  );
}

export function AiProviderModelCatalogFields({
  draft,
  onUpdateDraft,
}: {
  draft: ProviderDraft;
  onUpdateDraft: (updater: (current: ProviderDraft) => ProviderDraft) => void;
}) {
  const catalog = draft.modelCatalog;
  const update = (change: Partial<ModelCatalogDraft>) =>
    onUpdateDraft((current) => ({
      ...current,
      modelCatalog: { ...(current.modelCatalog ?? modelCatalogDraftFromConfig()), ...change },
    }));
  const updatePagination = (change: Partial<NonNullable<ModelCatalogDraft['pagination']>>) => {
    if (catalog?.pagination) update({ pagination: { ...catalog.pagination, ...change } });
  };
  return (
    <FieldGroup>
      <CatalogChoice
        id="ai-catalog-rules"
        label="模型目录规则"
        value={catalog ? 'manual' : 'default'}
        items={ruleOptions}
        description={
          catalog
            ? '获取目录只更新候选模型；保存修改后才会记住这套规则。'
            : '默认请求生成地址下的 /models，并读取 /data 中的 /id。选择手动配置可指定其他目录规则。'
        }
        onChange={(value) =>
          onUpdateDraft((current) => ({
            ...current,
            modelCatalog:
              value === 'manual' ? (current.modelCatalog ?? modelCatalogDraftFromConfig()) : null,
          }))
        }
      />
      {catalog && (
        <>
          <CatalogInput
            id="ai-catalog-url"
            label="目录请求地址"
            value={catalog.url}
            type="url"
            required
            placeholder="https://api.example.com/catalog"
            onChange={(url) => update({ url })}
            description="使用当前认证方式；使用 API Key 时，目录地址须与生成地址同源。"
          />
          <FieldGroup className="sm:grid sm:grid-cols-2">
            <CatalogInput
              id="ai-catalog-items"
              label="响应列表路径"
              value={catalog.itemsPath}
              placeholder="/data"
              onChange={(itemsPath) => update({ itemsPath })}
              description="使用 JSON Pointer；留空表示整个响应是列表。"
            />
            <CatalogInput
              id="ai-catalog-id"
              label="模型 ID 路径"
              value={catalog.idPath}
              placeholder="/id"
              onChange={(idPath) => update({ idPath })}
              description="相对于列表项；留空表示列表项本身就是 ID。"
            />
          </FieldGroup>
          <CatalogInput
            id="ai-catalog-reasoning"
            label="推理元数据路径"
            value={catalog.reasoningPath ?? '/reasoning'}
            onChange={(reasoningPath) => update({ reasoningPath })}
            description="相对于列表项；仅读取已支持的推理能力字段。"
          />
          <CatalogChoice
            id="ai-catalog-filter"
            label="目录筛选"
            value={catalog.filter ? 'equals' : 'none'}
            items={filterOptions}
            onChange={(value) =>
              update({ filter: value === 'equals' ? { path: '/type', equals: '' } : null })
            }
          />
          {catalog.filter && (
            <FieldGroup className="sm:grid sm:grid-cols-2">
              <CatalogInput
                id="ai-catalog-filter-path"
                label="筛选字段路径"
                value={catalog.filter.path}
                onChange={(path) => update({ filter: { ...catalog.filter!, path } })}
              />
              <CatalogInput
                id="ai-catalog-filter-value"
                label="筛选匹配值"
                value={catalog.filter.equals}
                onChange={(equals) => update({ filter: { ...catalog.filter!, equals } })}
              />
            </FieldGroup>
          )}
          <CatalogChoice
            id="ai-catalog-pagination"
            label="目录分页"
            value={catalog.pagination ? 'page' : 'none'}
            items={paginationOptions}
            onChange={(value) =>
              update({
                pagination:
                  value === 'page'
                    ? {
                        pageParam: 'page',
                        pageSizeParam: 'limit',
                        pageSize: '100',
                        startPage: '1',
                        stopWhen: 'empty-page',
                      }
                    : null,
              })
            }
          />
          {catalog.pagination && (
            <>
              <FieldGroup className="sm:grid sm:grid-cols-2">
                <CatalogInput
                  id="ai-catalog-page-param"
                  label="页码参数名"
                  value={catalog.pagination.pageParam}
                  onChange={(pageParam) => updatePagination({ pageParam })}
                />
                <CatalogInput
                  id="ai-catalog-size-param"
                  label="页容量参数名"
                  value={catalog.pagination.pageSizeParam}
                  onChange={(pageSizeParam) => updatePagination({ pageSizeParam })}
                  description="接口不接受该参数时可留空。"
                />
                <CatalogInput
                  id="ai-catalog-page-size"
                  label="目录每页条数"
                  value={catalog.pagination.pageSize}
                  type="number"
                  min={1}
                  max={2000}
                  onChange={(pageSize) => updatePagination({ pageSize })}
                />
                <CatalogInput
                  id="ai-catalog-start-page"
                  label="目录起始页"
                  value={catalog.pagination.startPage}
                  type="number"
                  min={0}
                  max={1000000}
                  onChange={(startPage) => updatePagination({ startPage })}
                />
              </FieldGroup>
              <CatalogChoice
                id="ai-catalog-stop"
                label="分页结束规则"
                value={catalog.pagination.stopWhen}
                items={stopOptions}
                onChange={(value) => {
                  if (value === 'empty-page' || value === 'short-page')
                    updatePagination({ stopWhen: value });
                }}
              />
            </>
          )}
        </>
      )}
    </FieldGroup>
  );
}

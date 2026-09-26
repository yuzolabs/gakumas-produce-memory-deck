import { memoryMaster, type SkillCard } from '../domain/memory-master';
import { SkillCardSearchInput } from './skill-card-search-input';
import { emptyMemoryFilters, type MemoryFilters } from '../domain/memory-filters';
import { SelectionField } from './selection-field';
import { Button } from './ui/button';

/** Bonus filters are minimum values; customization levels are exact matches. */
export function MemoryFilterPanel({
  filters,
  searchCards,
  onChange,
}: {
  filters: MemoryFilters;
  searchCards: SkillCard[];
  onChange: (filters: MemoryFilters) => void;
}) {
  const custom = memoryMaster.customizations.find((c) => c.id === filters.customId);
  function update<K extends keyof MemoryFilters>(key: K, value: MemoryFilters[K]) {
    onChange({ ...filters, [key]: value });
  }
  return (
    <section className="filter-panel" aria-label="カードとメモリーの絞り込み">
      <div className="filter-basics">
        <SkillCardSearchInput
          className="search-field"
          cards={searchCards}
          query={filters.query}
          onQueryChange={(query) => update('query', query)}
          onSelect={() => true}
        />
        <SelectionField
          label="プラン"
          value={filters.plan}
          onChange={(value) => update('plan', value)}
          options={[
            { value: '', label: 'すべて' },
            ...memoryMaster.plans.map((p) => ({ value: p.id, label: p.label })),
          ]}
        />
        <SelectionField
          label="取得タイミング"
          value={filters.timing}
          onChange={(value) => update('timing', value)}
          options={[
            { value: '', label: 'すべて' },
            ...memoryMaster.acquisitionTimings.map((t) => ({ value: t.id, label: t.label })),
          ]}
        />
      </div>
      <details className="advanced-filters">
        <summary>カスタム・HIF・ボーナス条件</summary>
        <div className="field-grid">
          <SelectionField
            label="カスタムの種類"
            value={filters.customId}
            onChange={(value) => onChange({ ...filters, customId: value, customValueId: '' })}
            options={[
              { value: '', label: '指定なし' },
              ...memoryMaster.customizations.map((c) => ({
                value: c.id,
                label: `${c.name}（最大${Math.max(...c.values.map((v) => v.cost))}段階・${c.id}）`,
              })),
            ]}
          />
          <SelectionField
            label="カスタムの段階"
            value={filters.customValueId}
            onChange={(value) => update('customValueId', value)}
            disabled={!custom}
            options={[
              { value: '', label: '指定なし' },
              ...(custom?.values.map((v) => ({ value: v.id, label: v.label })) ?? []),
            ]}
          />
          <SelectionField
            label="HIFの有無"
            value={filters.hif}
            onChange={(value) =>
              onChange({ ...filters, hif: value, hifId: value === 'no' ? '' : filters.hifId })
            }
            options={[
              { value: '', label: '指定なし' },
              { value: 'yes', label: 'あり' },
              { value: 'no', label: 'なし' },
            ]}
          />
          <SelectionField
            label="HIFの対象・効果"
            value={filters.hifId}
            onChange={(value) =>
              onChange({ ...filters, hifId: value, hif: value ? 'yes' : filters.hif })
            }
            disabled={filters.hif === 'no'}
            options={[
              { value: '', label: '指定なし' },
              ...memoryMaster.abilities.map((a) => ({ value: a.id, label: a.name })),
            ]}
          />
        </div>
        <div className="bonus-filter-grid">
          {memoryMaster.attributes.map((attribute) => (
            <div key={attribute.id} className={attribute.id}>
              <h3>{attribute.label}の下限</h3>
              {memoryMaster.bonusDefinitions.map((definition) => {
                const key =
                  `${attribute.id}${definition.id === 'lesson' ? 'Lesson' : 'Initial'}` as
                    'voLesson' | 'daLesson' | 'viLesson' | 'voInitial' | 'daInitial' | 'viInitial';
                return (
                  <SelectionField
                    key={definition.id}
                    label={`${attribute.label} ${definition.label}の下限`}
                    value={String(filters[key])}
                    onChange={(value) => update(key, Number(value))}
                    options={definition.values.map((value) => ({
                      value: String(value),
                      label: value === 0 ? '指定なし' : `+${value}${definition.unit}以上`,
                    }))}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </details>
      <div className="filter-footer">
        <Button variant="outline" onClick={() => onChange({ ...emptyMemoryFilters })}>
          条件をリセット
        </Button>
        <SelectionField
          label="並び順"
          value={filters.sort}
          onChange={(value) => update('sort', value)}
          options={[
            { value: 'name', label: 'カード名順' },
            { value: 'owned', label: '所持数が多い順' },
            { value: 'updated', label: '更新が新しい順' },
          ]}
        />
      </div>
    </section>
  );
}

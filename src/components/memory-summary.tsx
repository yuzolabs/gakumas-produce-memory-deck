import { memoryMaster } from '../domain/memory-master';
import { SkillCardIcon } from './skill-card-icon';
import {
  describeMemoryCustomizations,
  describeMemoryHif,
  type ProduceMemory,
} from '../domain/produce-memory';

/** Each summary is one real memory; bonus maxima from different copies are never combined. */
export function MemorySummary({ memory }: { memory: ProduceMemory }) {
  const card = memoryMaster.cards.find((c) => c.id === memory.cardId);
  return (
    <div className="memory-summary">
      <h3>
        {card && <SkillCardIcon card={card} className="summary-card-icon" />}
        <span>{card?.name ?? (memory.cardId || 'カード未選択')}</span>
      </h3>
      <dl className="summary-details">
        <dt>取得タイミング</dt>
        <dd>
          {memoryMaster.acquisitionTimings.find((t) => t.id === memory.acquisitionTimingId)
            ?.label ?? memory.acquisitionTimingId}
        </dd>
        <dt>カスタム</dt>
        <dd>{describeMemoryCustomizations(memory)}</dd>
        <dt>HIFアビリティ</dt>
        <dd>{describeMemoryHif(memory)}</dd>
      </dl>
      <div className="bonus-strip">
        {memoryMaster.attributes.map((attribute) => (
          <div className={`bonus-value ${attribute.id}`} key={attribute.id}>
            <span>{attribute.label}</span>
            <strong>{memory.bonuses[attribute.id].lesson}%</strong>
            <small>初期 +{memory.bonuses[attribute.id].initial}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

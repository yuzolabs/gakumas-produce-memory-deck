import { useId, useState } from 'react';
import { memoryMaster, type SkillCard } from '../domain/memory-master';
import { SkillCardIcon } from './skill-card-icon';
import { SkillCardSearchInput } from './skill-card-search-input';

/** Search suggestions only change the selected card after explicit click or Enter. */
export function SkillCardSearch({
  cards,
  selectedId,
  onSelect,
  disabled = false,
}: {
  cards: SkillCard[];
  selectedId: string;
  disabled?: boolean;
  onSelect: (cardId: SkillCard['id']) => boolean;
}) {
  const selectedCard = memoryMaster.cards.find((card) => card.id === selectedId);
  const [query, setQuery] = useState(selectedCard?.name ?? '');
  const selectionId = useId();
  return (
    <SkillCardSearchInput
      cards={cards}
      query={query}
      onQueryChange={setQuery}
      onSelect={(card) => onSelect(card.id)}
      disabled={disabled}
      describedBy={selectionId}
    >
      <p id={selectionId} className="skill-search-selection">
        {selectedCard ? (
          <>
            選択中：
            <SkillCardIcon card={selectedCard} className="skill-selection-icon" />
            <strong>{selectedCard.name}</strong>
          </>
        ) : selectedId ? (
          `選択中の不明なカードID：${selectedId}`
        ) : (
          'カード名を入力し、表示された候補から選択してください。'
        )}
      </p>
    </SkillCardSearchInput>
  );
}

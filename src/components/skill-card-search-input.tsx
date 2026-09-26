import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { memoryMaster, type SkillCard } from '../domain/memory-master';
import { normalizeSkillCardSearch, searchSkillCards } from '../domain/skill-card-search';
import { SkillCardIcon } from './skill-card-icon';

/** Shared card suggestions preserve IME input; returning false cancels a selection. */
export function SkillCardSearchInput({
  cards,
  query,
  onQueryChange,
  onSelect,
  disabled = false,
  className = '',
  describedBy,
  children,
}: {
  cards: SkillCard[];
  query: string;
  onQueryChange: (query: string) => void;
  onSelect: (card: SkillCard) => boolean;
  disabled?: boolean;
  className?: string;
  describedBy?: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const id = useId();
  const normalized = normalizeSkillCardSearch(query);
  const matches = searchSkillCards(cards, query);
  const visible = !disabled && open && normalized.length > 0;
  const activeCard = visible ? matches[activeIndex] : undefined;

  useEffect(() => {
    const option = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (option) option.scrollIntoView({ block: 'nearest' });
  }, [activeCard?.id]);

  function chooseCard(card: SkillCard) {
    if (disabled || !onSelect(card)) return;
    onQueryChange(card.name);
    setActiveIndex(-1);
    inputRef.current?.focus({ preventScroll: true });
    setOpen(false);
  }
  function handleSearchKeys(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!matches.length) return;
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) =>
        !visible || current === -1
          ? event.key === 'ArrowDown'
            ? 0
            : matches.length - 1
          : Math.max(
              0,
              Math.min(matches.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1)),
            ),
      );
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (activeCard) chooseCard(activeCard);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      setActiveIndex(-1);
    }
  }
  return (
    <div
      className={`field skill-card-search ${className}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
          setActiveIndex(-1);
        }
      }}
    >
      <label htmlFor={id}>カード名で検索</label>
      <input
        id={id}
        ref={inputRef}
        type="text"
        role="combobox"
        autoComplete="off"
        disabled={disabled}
        aria-autocomplete="list"
        aria-expanded={visible && matches.length > 0}
        aria-controls={visible && matches.length > 0 ? `${id}-results` : undefined}
        aria-activedescendant={activeCard ? `${id}-${activeCard.id}` : undefined}
        aria-describedby={describedBy}
        value={query}
        placeholder="例：スポットライト"
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          onQueryChange(event.target.value);
          setActiveIndex(-1);
          setOpen(true);
        }}
        onKeyDown={handleSearchKeys}
      />
      {visible && (
        <div className="skill-search-suggestions">
          <p role="status" className="skill-search-count">
            {matches.length
              ? `${matches.length}件の候補。クリック、または上下キーとEnterで選択してください。`
              : '一致するカードがありません。カード名を変えて検索してください。'}
          </p>
          {matches.length > 0 && (
            <ul
              id={`${id}-results`}
              role="listbox"
              aria-label="カード名の検索結果"
              ref={listRef}
              className="skill-search-results"
            >
              {matches.map((card, index) => (
                <li
                  key={card.id}
                  id={`${id}-${card.id}`}
                  role="option"
                  tabIndex={-1}
                  aria-selected={index === activeIndex}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => chooseCard(card)}
                >
                  <SkillCardIcon card={card} className="skill-option-icon" />
                  <span className="skill-option-text">
                    <strong>{card.name}</strong>
                    <span>
                      {memoryMaster.plans.find((plan) => plan.id === card.plan)?.label} /{' '}
                      {card.rarity} / {card.kind === 'active' ? 'アクティブ' : 'メンタル'}
                      {card.retired ? '（廃止）' : ''}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

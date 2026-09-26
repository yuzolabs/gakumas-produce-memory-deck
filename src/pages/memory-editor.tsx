import { useEffect, useRef, useState } from 'react';
import { Link, useBlocker, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { memoryMaster } from '../domain/memory-master';
import { createMemoryDraft, getMemoryIssues, type ProduceMemory } from '../domain/produce-memory';
import { describeStorageError, useMemoryStore } from '../storage/memory-store';
import { SelectionField } from '../components/selection-field';
import { SkillCardSearch } from '../components/skill-card-search';
import { CustomizationStepper } from '../components/customization-stepper';
import { MemorySummary } from '../components/memory-summary';
import { MemoryConfirmDialog } from '../components/memory-confirm-dialog';
import { Button } from '../components/ui/button';

/** Invalid edit/copy links never create an accidental blank record. */
export function MemoryEditorPage() {
  const { id } = useParams();
  const [search] = useSearchParams();
  const { state } = useMemoryStore();
  if (state.status !== 'ready') return null;
  const copyId = search.get('copy');
  const source = state.snapshot.memories.find((memory) => memory.id === (id ?? copyId));
  if ((id || copyId) && !source)
    return (
      <section className="empty-state">
        <h1>メモリーが見つかりません</h1>
        <p>削除されたか、URLが間違っています。</p>
        <Link to="/">一覧に戻る</Link>
      </section>
    );
  const initial = source
    ? copyId
      ? { ...structuredClone(source), ...createCopyIdentity() }
      : structuredClone(source)
    : createMemoryDraft(search.get('card') ?? '');
  return (
    <MemoryEditorForm
      key={id ?? copyId ?? search.get('card') ?? 'new'}
      initial={initial}
      editing={Boolean(id)}
      copying={Boolean(copyId)}
    />
  );
}
function createCopyIdentity() {
  const draft = createMemoryDraft();
  return { id: draft.id, createdAt: draft.createdAt, updatedAt: draft.updatedAt };
}

function MemoryEditorForm({
  initial,
  editing,
  copying,
}: {
  initial: ProduceMemory;
  editing: boolean;
  copying: boolean;
}) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmation, setConfirmation] = useState<'save' | 'next' | null>(null);
  const dirty = useRef(copying);
  const blocker = useBlocker(() => dirty.current);
  const navigate = useNavigate();
  const store = useMemoryStore();
  const card = memoryMaster.cards.find((c) => c.id === draft.cardId);
  const issues = getMemoryIssues(draft, memoryMaster, editing);
  const selectedCost = draft.customizations.reduce(
    (total, selected) =>
      total +
      (memoryMaster.customizations
        .find((c) => c.id === selected.definitionId)
        ?.values.find((v) => v.id === selected.valueId)?.cost ?? 0),
    0,
  );
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (dirty.current) event.preventDefault();
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, []);
  function updateDraft(next: ProduceMemory) {
    dirty.current = true;
    setError('');
    setNotice('');
    setDraft(next);
  }
  function selectCard(cardId: string) {
    if (draft.cardId === cardId) return true;
    if (
      (draft.customizations.length || draft.hif) &&
      !window.confirm('カードを変更するとカスタムとHIFアビリティの選択を解除します。変更しますか？')
    )
      return false;
    updateDraft({
      ...draft,
      cardId: cardId as ProduceMemory['cardId'],
      customizations: [],
      hif: null,
    });
    return true;
  }
  async function saveMemory() {
    try {
      await store.save({ ...draft, updatedAt: new Date().toISOString() });
      dirty.current = false;
      if (confirmation === 'next') {
        setDraft(createMemoryDraft(draft.cardId));
        setConfirmation(null);
        setNotice('保存しました。同じカードの次のメモリーを登録できます。');
      } else {
        setConfirmation(null);
        navigate('/', { state: { notice: 'メモリーを保存しました。' } });
      }
    } catch (caught) {
      setError(describeStorageError(caught));
    }
  }
  const selectableCards = memoryMaster.cards.filter(
    (c) => !c.retired || (c.id === initial.cardId && editing),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <Link className="back-link" to="/">
            一覧に戻る
          </Link>
          <h1>{editing ? 'メモリーを編集' : copying ? 'メモリーを複製' : 'メモリーを登録'}</h1>
        </div>
      </div>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <div className="editor-layout">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setError('');
            setConfirmation('save');
          }}
        >
          <fieldset className="form-section" disabled={store.busy}>
            <legend>獲得するスキルカード</legend>
            <SkillCardSearch
              cards={selectableCards}
              selectedId={draft.cardId}
              onSelect={selectCard}
              disabled={store.busy}
            />
            <SelectionField
              label="取得タイミング"
              value={draft.acquisitionTimingId}
              onChange={(value) => updateDraft({ ...draft, acquisitionTimingId: value })}
              options={memoryMaster.acquisitionTimings
                .filter((t) => !t.retired || (editing && t.id === initial.acquisitionTimingId))
                .map((t) => ({ value: t.id, label: t.label }))}
            />
          </fieldset>
          <fieldset className="form-section" disabled={store.busy || !card}>
            <legend>カスタム</legend>
            <p className="section-hint">
              {card
                ? `合計 ${selectedCost} / ${card.maxCustomizations}段階。−／＋で調整し、0でカスタムなしに戻します。数値は効果の最終値ではなく、特別指導の回数です。`
                : '先にカードを選択してください。'}
            </p>
            {card?.customizationIds.length === 0 && (
              <p>このカードには選択可能なカスタムがありません。</p>
            )}
            <div className="customization-list">
              {card?.customizationIds.map((id) => {
                const definition = memoryMaster.customizations.find((c) => c.id === id)!;
                const selected = draft.customizations.find((c) => c.definitionId === id);
                const oldSelected = initial.customizations.find((c) => c.definitionId === id);
                if (definition.retired && !(editing && oldSelected)) return null;
                const ownCost =
                  definition.values.find((v) => v.id === selected?.valueId)?.cost ?? 0;
                return (
                  <CustomizationStepper
                    key={id}
                    label={definition.name}
                    selectedId={selected?.valueId ?? ''}
                    maxCost={card.maxCustomizations - selectedCost + ownCost}
                    disabled={store.busy}
                    onChange={(valueId) =>
                      updateDraft({
                        ...draft,
                        customizations: [
                          ...draft.customizations.filter((c) => c.definitionId !== id),
                          ...(valueId ? [{ definitionId: id, valueId }] : []),
                        ],
                      })
                    }
                    values={definition.values.filter(
                      (v) => !v.retired || (editing && v.id === oldSelected?.valueId),
                    )}
                  />
                );
              })}
            </div>
          </fieldset>
          <fieldset className="form-section" disabled={store.busy || !card}>
            <legend>HIFアビリティ</legend>
            <SelectionField
              label="HIFの発動対象カード"
              hideLabel
              value={draft.hif?.abilityId ?? ''}
              onChange={(id) => {
                const selected = memoryMaster.abilities.find((a) => a.id === id);
                updateDraft({
                  ...draft,
                  hif: selected
                    ? {
                        abilityId: selected.id,
                        valueId: selected.values.find((v) => !v.retired)!.id,
                      }
                    : null,
                });
              }}
              options={[
                { value: '', label: 'HIFアビリティなし' },
                ...memoryMaster.abilities
                  .filter(
                    (a) =>
                      (!a.retired || (editing && a.id === initial.hif?.abilityId)) &&
                      (card?.plan === 'free' || card?.plan === a.plan),
                  )
                  .map((a) => ({ value: a.id, label: a.name })),
              ]}
            />
          </fieldset>
          <fieldset className="form-section" disabled={store.busy}>
            <legend>パラメーターボーナス</legend>
            <div className="bonus-fields">
              {memoryMaster.attributes.map((attribute) => (
                <div className={`bonus-column ${attribute.id}`} key={attribute.id}>
                  <h3>
                    {attribute.label} <small>{attribute.name}</small>
                  </h3>
                  {memoryMaster.bonusDefinitions.map((definition) => (
                    <SelectionField
                      key={definition.id}
                      label={`${attribute.label} ${definition.label}`}
                      value={String(draft.bonuses[attribute.id][definition.id])}
                      onChange={(value) =>
                        updateDraft({
                          ...draft,
                          bonuses: {
                            ...draft.bonuses,
                            [attribute.id]: {
                              ...draft.bonuses[attribute.id],
                              [definition.id]: Number(value),
                            },
                          },
                        })
                      }
                      options={definition.values
                        .filter(
                          (value) =>
                            !definition.retiredValues.includes(value) ||
                            (editing && value === initial.bonuses[attribute.id][definition.id]),
                        )
                        .map((value) => ({
                          value: String(value),
                          label: `${value === 0 ? '' : '+'}${value}${definition.unit}${definition.retiredValues.includes(value) ? '（廃止）' : ''}`,
                        }))}
                    />
                  ))}
                </div>
              ))}
            </div>
          </fieldset>
          {issues.length > 0 && (
            <div className="validation-message" role="status">
              <p>保存するには次の項目を確認してください。</p>
              <ul>
                {issues.map((issue, index) => (
                  <li key={index}>{issue}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="form-actions">
            <Button type="submit" disabled={Boolean(issues.length) || store.busy}>
              内容を確認して保存
            </Button>
            {!editing && (
              <Button
                variant="outline"
                type="button"
                disabled={Boolean(issues.length) || store.busy}
                onClick={() => {
                  setError('');
                  setConfirmation('next');
                }}
              >
                保存して次を登録
              </Button>
            )}
          </div>
        </form>
        <aside className="preview-panel" aria-label="入力内容のプレビュー">
          <h2>登録するメモリー</h2>
          <MemorySummary memory={draft} />
        </aside>
      </div>
      <MemoryConfirmDialog
        open={confirmation !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmation(null);
        }}
        title="この内容で保存しますか？"
        action={confirmation === 'next' ? '保存して次を登録' : '保存する'}
        busy={store.busy}
        error={error}
        onConfirm={() => void saveMemory()}
      >
        <MemorySummary memory={draft} />
      </MemoryConfirmDialog>
      <MemoryConfirmDialog
        open={blocker.state === 'blocked'}
        onOpenChange={(open) => {
          if (!open && blocker.state === 'blocked') blocker.reset();
        }}
        title="入力内容を破棄しますか？"
        description="まだ保存していない変更があります。"
        action="破棄して移動"
        onConfirm={() => {
          if (blocker.state === 'blocked') {
            dirty.current = false;
            blocker.proceed();
          }
        }}
      />
    </>
  );
}

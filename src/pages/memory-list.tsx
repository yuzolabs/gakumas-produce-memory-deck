import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown, Plus } from 'lucide-react';
import { memoryMaster } from '../domain/memory-master';
import {
  emptyMemoryFilters,
  filterOwnedMemoryCards,
  type MemoryCardGroup,
  type MemoryFilters,
} from '../domain/memory-filters';
import {
  describeMemoryCustomizations,
  describeMemoryHif,
  getMemoryIssues,
  type ProduceMemory,
} from '../domain/produce-memory';
import { describeStorageError, useMemoryStore } from '../storage/memory-store';
import { MemoryFilterPanel } from '../components/memory-filter-panel';
import { MemorySummary } from '../components/memory-summary';
import { SkillCardIcon } from '../components/skill-card-icon';
import { MemoryConfirmDialog } from '../components/memory-confirm-dialog';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';

function MemoryActions({
  memory,
  onDelete,
}: {
  memory: ProduceMemory;
  onDelete: (memory: ProduceMemory) => void;
}) {
  return (
    <div className="memory-actions">
      <Link to={`/memories/${memory.id}/edit`}>編集</Link>
      <Link to={`/memories/new?copy=${memory.id}`}>複製</Link>
      <Button variant="ghost" onClick={() => onDelete(memory)}>
        削除
      </Button>
    </div>
  );
}
function CardMemoryGroup({
  group,
  onDelete,
}: {
  group: MemoryCardGroup;
  onDelete: (memory: ProduceMemory) => void;
}) {
  const [expanded, setExpanded] = useState(group.owned.length === 1);
  const { card, owned, matching } = group;
  const matchingIds = new Set(matching.map((m) => m.id));
  const plan = memoryMaster.plans.find((p) => p.id === card.plan)?.label;
  return (
    <article className="card-group is-owned" aria-label={card.name}>
      <div className="card-group-heading">
        <button
          className="card-toggle"
          aria-expanded={expanded}
          aria-controls={`copies-${card.id}`}
          onClick={() => setExpanded(!expanded)}
        >
          <SkillCardIcon card={card} className={`card-icon ${card.kind}`} />
          <span className="card-identity">
            <strong>{card.name}</strong>
            <span>
              {plan} / {card.rarity} / {card.kind === 'active' ? 'アクティブ' : 'メンタル'}
              {card.retired ? ' / 廃止' : ''}
            </span>
          </span>
          <span className="owned-count">
            <b>{owned.length}</b>枚
            {matching.length !== owned.length && <small>条件一致 {matching.length}枚</small>}
          </span>
          <ChevronDown aria-hidden="true" className={expanded ? 'is-expanded' : ''} />
        </button>
        {!card.retired && (
          <Link
            className="card-add"
            to={`/memories/new?card=${card.id}`}
            aria-label={`${card.name}を登録`}
          >
            <Plus aria-hidden="true" />
            <span>登録</span>
          </Link>
        )}
      </div>
      {expanded && (
        <div id={`copies-${card.id}`} className="comparison-area">
          <table className="comparison-table">
            <caption className="sr-only">
              {card.name}のメモリー比較。ボーナスは割合／初期加算。
            </caption>
            <thead>
              <tr>
                <th>取得タイミング</th>
                <th>カスタム</th>
                <th>HIFアビリティ</th>
                {memoryMaster.attributes.map((a) => (
                  <th key={a.id} className={a.id}>
                    {a.label}
                    <small>割合 / 初期</small>
                  </th>
                ))}
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {owned.map((memory) => (
                <tr key={memory.id} className={matchingIds.has(memory.id) ? '' : 'not-matching'}>
                  <td data-label="取得タイミング">
                    <span>
                      {memoryMaster.acquisitionTimings.find(
                        (t) => t.id === memory.acquisitionTimingId,
                      )?.label ?? memory.acquisitionTimingId}
                    </span>
                    {!matchingIds.has(memory.id) && <Badge variant="outline">条件不一致</Badge>}
                    {getMemoryIssues(memory).length > 0 && (
                      <Badge variant="destructive">要確認</Badge>
                    )}
                  </td>
                  <td data-label="カスタム">{describeMemoryCustomizations(memory)}</td>
                  <td data-label="HIFアビリティ">{describeMemoryHif(memory)}</td>
                  {memoryMaster.attributes.map((a) => (
                    <td
                      data-label={`${a.label} 割合 / 初期`}
                      key={a.id}
                      className={`bonus-cell ${a.id}`}
                    >
                      <strong>{memory.bonuses[a.id].lesson}%</strong>
                      <span>+{memory.bonuses[a.id].initial}</span>
                    </td>
                  ))}
                  <td data-label="操作">
                    <MemoryActions memory={memory} onDelete={onDelete} />
                    <small className="record-date">
                      登録 {new Date(memory.createdAt).toLocaleDateString('ja-JP')}
                    </small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}

/** Card-centric comparison always displays each owned copy as a separate row. */
export function MemoryListPage() {
  const store = useMemoryStore();
  const location = useLocation();
  const [filters, setFilters] = useState<MemoryFilters>({ ...emptyMemoryFilters });
  const [page, setPage] = useState(1);
  const [deleting, setDeleting] = useState<ProduceMemory | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<string>(location.state?.notice ?? '');
  if (store.state.status !== 'ready') return null;
  const memories = store.state.snapshot.memories;
  const groups = filterOwnedMemoryCards(memories, filters);
  const pageCount = Math.max(1, Math.ceil(groups.length / 24));
  const currentPage = Math.min(page, pageCount);
  const unknownMemories = memories.filter(
    (m) => !memoryMaster.cards.some((c) => c.id === m.cardId),
  );
  async function removeMemory() {
    if (!deleting) return;
    try {
      await store.remove(deleting.id);
      setDeleting(null);
      setNotice('メモリーを削除しました。');
    } catch (caught) {
      setError(describeStorageError(caught));
    }
  }
  function askDelete(memory: ProduceMemory) {
    setError('');
    setDeleting(memory);
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>所持カード一覧</h1>
        </div>
        <Link className="primary-link" to="/memories/new">
          <Plus aria-hidden="true" />
          メモリーを登録
        </Link>
      </div>
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      <div className="collection-summary">
        <span>
          登録メモリー <strong>{memories.length}</strong> 枚
        </span>
      </div>
      <MemoryFilterPanel
        filters={filters}
        searchCards={filterOwnedMemoryCards(memories, { ...filters, query: '' }).map(
          (group) => group.card,
        )}
        onChange={(next) => {
          setFilters(next);
          setPage(1);
        }}
      />
      {unknownMemories.length > 0 && (
        <section className="unknown-memories">
          <h2>マスターに見つからないメモリー</h2>
          <p>データは保持しています。バックアップを取り、マスターの更新状況を確認してください。</p>
          {unknownMemories.map((memory) => (
            <article key={memory.id}>
              <MemorySummary memory={memory} />
              <MemoryActions memory={memory} onDelete={askDelete} />
            </article>
          ))}
        </section>
      )}
      <div className="list-caption">
        <h2>所持カード</h2>
        <p role="status">
          {groups.length}種のカード{pageCount > 1 ? ` · ${currentPage} / ${pageCount}ページ` : ''}
        </p>
      </div>
      {groups.length === 0 ? (
        <section className="empty-state">
          <h2>
            {memories.length
              ? '条件に一致する所持カードがありません'
              : 'まだメモリーが登録されていません'}
          </h2>
          <p>
            {memories.length
              ? 'カード名や絞り込み条件を変更してください。'
              : '「メモリーを登録」から、所持しているカードのメモリーを追加してください。'}
          </p>
          {memories.length > 0 ? (
            <Button variant="outline" onClick={() => setFilters({ ...emptyMemoryFilters })}>
              条件をリセット
            </Button>
          ) : (
            <Link to="/memories/new">メモリーを登録</Link>
          )}
        </section>
      ) : (
        <div className="card-collection">
          {groups.slice((currentPage - 1) * 24, currentPage * 24).map((group) => (
            <CardMemoryGroup key={group.card.id} group={group} onDelete={askDelete} />
          ))}
        </div>
      )}
      {pageCount > 1 && (
        <nav className="pagination" aria-label="所持カード一覧のページ">
          <Button
            variant="outline"
            disabled={currentPage === 1}
            onClick={() => setPage(currentPage - 1)}
          >
            前のページ
          </Button>
          <span>
            {currentPage} / {pageCount}
          </span>
          <Button
            variant="outline"
            disabled={currentPage === pageCount}
            onClick={() => setPage(currentPage + 1)}
          >
            次のページ
          </Button>
        </nav>
      )}
      <MemoryConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title="このメモリーを削除しますか？"
        description="削除は取り消せません。同じカードの他のメモリーは残ります。"
        action="削除する"
        busy={store.busy}
        error={error}
        onConfirm={() => void removeMemory()}
      >
        {deleting && <MemorySummary memory={deleting} />}
      </MemoryConfirmDialog>
    </>
  );
}

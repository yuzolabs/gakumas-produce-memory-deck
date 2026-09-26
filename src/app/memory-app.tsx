import { useEffect, useState } from 'react';
import {
  createBrowserRouter,
  Link,
  NavLink,
  Outlet,
  RouterProvider,
  useLocation,
} from 'react-router-dom';
import { BookOpen, Plus, Archive } from 'lucide-react';
import { MemoryStoreProvider, describeStorageError, useMemoryStore } from '../storage/memory-store';
import { MemoryEditorPage } from '../pages/memory-editor';
import { downloadMemoryJson } from '../lib/download-memory-json';
import { Button } from '../components/ui/button';
import { MemoryListPage } from '../pages/memory-list';
import { MemorySettingsPage } from '../pages/memory-settings';

function MemoryLayout() {
  const store = useMemoryStore();
  const location = useLocation();
  const [recoveryError, setRecoveryError] = useState('');
  useEffect(() => {
    document.title = `${location.pathname === '/' ? '一覧' : location.pathname === '/settings' ? 'バックアップ' : '登録・編集'} | 学マスメモリー帳`;
    window.scrollTo(0, 0);
    document.getElementById('main-content')?.focus({ preventScroll: true });
  }, [location.pathname, location.search]);
  async function recoverRaw() {
    try {
      downloadMemoryJson(await store.readRaw(), 'memory-recovery.json');
    } catch (error) {
      setRecoveryError(describeStorageError(error));
    }
  }
  return (
    <>
      <a href="#main-content" className="skip-link">
        本文へ移動
      </a>
      <header className="site-header">
        <div className="header-inner">
          <Link className="brand" to="/">
            <BookOpen aria-hidden="true" />
            <span>
              <strong>学マスメモリー帳</strong>
            </span>
          </Link>
          <nav aria-label="メインナビゲーション">
            <NavLink to="/" end>
              <BookOpen aria-hidden="true" />
              一覧
            </NavLink>
            <NavLink to="/memories/new">
              <Plus aria-hidden="true" />
              登録
            </NavLink>
            <NavLink to="/settings">
              <Archive aria-hidden="true" />
              バックアップ
            </NavLink>
          </nav>
        </div>
      </header>
      <main id="main-content" tabIndex={-1}>
        {store.state.status === 'loading' ? (
          <p role="status">メモリーを読み込んでいます…</p>
        ) : store.state.status === 'error' ? (
          <section className="empty-state">
            <h1>保存データを読み込めません</h1>
            <p role="alert">{store.state.message}</p>
            <p>安全のため新規保存と上書きを停止しています。サイトデータは削除しないでください。</p>
            <Button onClick={() => void recoverRaw()}>保存データの原本をダウンロード</Button>
            {recoveryError && <p role="alert">{recoveryError}</p>}
            <Button variant="outline" onClick={() => window.location.reload()}>
              再読み込み
            </Button>
          </section>
        ) : (
          <Outlet />
        )}
      </main>
      <footer className="site-footer">
        <span>非公式ファンツール</span>
      </footer>
    </>
  );
}
const router = createBrowserRouter([
  {
    element: <MemoryLayout />,
    errorElement: (
      <main>
        <h1>画面を表示できません</h1>
        <p>保存データは削除せず、再読み込みしてください。</p>
        <a href="/">一覧を再読み込み</a>
      </main>
    ),
    children: [
      { path: '/', element: <MemoryListPage /> },
      { path: '/memories/new', element: <MemoryEditorPage /> },
      { path: '/memories/:id/edit', element: <MemoryEditorPage /> },
      { path: '/settings', element: <MemorySettingsPage /> },
      {
        path: '*',
        element: (
          <section className="empty-state">
            <h1>ページが見つかりません</h1>
            <Link to="/">一覧に戻る</Link>
          </section>
        ),
      },
    ],
  },
]);

/** Data-router navigation preserves in-progress forms until discard is confirmed. */
export function MemoryApp() {
  return (
    <MemoryStoreProvider>
      <RouterProvider router={router} />
    </MemoryStoreProvider>
  );
}

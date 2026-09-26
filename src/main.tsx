import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { MemoryApp } from './app/memory-app';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MemoryApp />
  </StrictMode>,
);

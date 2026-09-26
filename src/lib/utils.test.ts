import { expect, it } from 'vitest';
import { cn } from './utils';

it('combines conditional class names and resolves Tailwind conflicts', () => {
  expect(cn('p-2', false, ['p-4'], { 'text-sm': true, hidden: false }, undefined)).toBe(
    'p-4 text-sm',
  );
});

import { useId } from 'react';
import type { MemoryMaster } from '../domain/memory-master';
import { getCustomizationSteps } from '../domain/customization-steps';
import { Button } from './ui/button';

/** Zero removes a customization; +/- buttons never exceed the card's remaining budget. */
export function CustomizationStepper({
  label,
  selectedId,
  values,
  maxCost,
  disabled,
  onChange,
}: {
  label: string;
  selectedId: string;
  values: MemoryMaster['customizations'][number]['values'];
  maxCost: number;
  disabled: boolean;
  onChange: (valueId: string) => void;
}) {
  const id = useId();
  const { current, previous, next } = getCustomizationSteps(values, selectedId, maxCost);
  return (
    <div className="customization-stepper" role="group" aria-labelledby={`${id}-label`}>
      <div className="customization-label">
        <span id={`${id}-label`}>{label}</span>
        <small>段階</small>
      </div>
      <div className="customization-controls">
        <Button
          type="button"
          variant="outline"
          aria-label={`${label}を減らす`}
          disabled={disabled || !previous}
          onClick={() => {
            if (previous) onChange(previous.id);
          }}
        >
          −
        </Button>
        <output aria-label={`${label}の段階`} aria-live="polite" aria-atomic="true">
          {current ? current.cost : `不明: ${selectedId}`}
        </output>
        <Button
          type="button"
          variant="outline"
          aria-label={`${label}を増やす`}
          disabled={disabled || !next}
          onClick={() => {
            if (next) onChange(next.id);
          }}
        >
          ＋
        </Button>
      </div>
    </div>
  );
}

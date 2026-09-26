import { useId } from 'react';

/** Native select preserves keyboard and mobile picker behavior with an explicit label. */
export function SelectionField({
  label,
  value,
  onChange,
  options,
  disabled = false,
  hint,
  hideLabel = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; disabled?: boolean }[];
  disabled?: boolean;
  hint?: string;
  /** Keeps the label for screen readers and getByLabel while hiding the visible text. */
  hideLabel?: boolean;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id} className={hideLabel ? 'visually-hidden' : undefined}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        aria-describedby={hint ? `${id}-hint` : undefined}
      >
        {!options.some((option) => option.value === value) && (
          <option value={value}>不明／選択対象外: {value}</option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}

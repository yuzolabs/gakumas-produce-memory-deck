import { useId } from 'react';

/** Short exclusive choices render as tappable blocks instead of a native select dropdown. */
export function BlockChoiceField({
  label,
  value,
  onChange,
  options,
  disabled = false,
  hideLabel = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; disabled?: boolean }[];
  disabled?: boolean;
  /** Keeps the legend for screen readers while the section legend labels the group visually. */
  hideLabel?: boolean;
}) {
  const name = useId();
  // Unknown values (e.g. retired ids in old records) stay visible as a disabled checked block.
  const choices = options.some((option) => option.value === value)
    ? options
    : [...options, { value, label: '不明／選択対象外', disabled: true }];
  return (
    <fieldset className="field block-choice" disabled={disabled}>
      <legend className={hideLabel ? 'visually-hidden' : undefined}>{label}</legend>
      <div className="block-choice-options">
        {choices.map((option) => (
          <label key={option.value} className="block-choice-option">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              disabled={disabled || option.disabled}
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

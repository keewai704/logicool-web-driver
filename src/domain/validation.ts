import type { ExtendedDpiSettings, SuperstrikeButtonSettings, SuperstrikeSettings } from '../hid/features';

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

type ButtonName = 'Left' | 'Right';

export const NUMERIC_RANGES = {
  dpi: { min: 100, max: 32000, step: 50 },
  actuation: { min: 1, max: 10, step: 1 },
  rapidTrigger: { min: 1, max: 5, step: 1 },
  haptics: { min: 0, max: 5, step: 1 },
} as const;

function integerRangeError(label: string, value: number, min: number, max: number, step = 1): string | null {
  if (Number.isInteger(value) && value >= min && value <= max && (value - min) % step === 0) {
    return null;
  }

  return step === 1
    ? `${label} must be an integer from ${min} to ${max}.`
    : `${label} must be an integer from ${min} to ${max} in steps of ${step}.`;
}

function validateButton(label: ButtonName, settings: SuperstrikeButtonSettings): string[] {
  const { actuation, rapidTrigger, haptics } = NUMERIC_RANGES;
  return [
    integerRangeError(`${label} actuation`, settings.actuation, actuation.min, actuation.max, actuation.step),
    integerRangeError(
      `${label} rapid trigger`,
      settings.rapidTrigger,
      rapidTrigger.min,
      rapidTrigger.max,
      rapidTrigger.step,
    ),
    integerRangeError(`${label} haptics`, settings.haptics, haptics.min, haptics.max, haptics.step),
  ].filter((error): error is string => error !== null);
}

export function validateSuperstrikeSettings(input: SuperstrikeSettings): ValidationResult {
  const errors = [...validateButton('Left', input.left), ...validateButton('Right', input.right)];
  return { ok: errors.length === 0, errors };
}

export function validateExtendedDpiSettings(input: ExtendedDpiSettings): ValidationResult {
  const { min, max, step } = NUMERIC_RANGES.dpi;
  const errors = [
    integerRangeError('DPI X', input.x, min, max, step),
    integerRangeError('DPI Y', input.y, min, max, step),
  ].filter((error): error is string => error !== null);

  return { ok: errors.length === 0, errors };
}

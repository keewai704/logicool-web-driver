import type { SuperstrikeButtonSettings, SuperstrikeSettings } from '../hid/features';

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

type ButtonName = 'Left' | 'Right';

function integerRangeError(label: string, value: number, min: number, max: number): string | null {
  if (Number.isInteger(value) && value >= min && value <= max) {
    return null;
  }

  return `${label} must be an integer from ${min} to ${max}.`;
}

function validateButton(label: ButtonName, settings: SuperstrikeButtonSettings): string[] {
  return [
    integerRangeError(`${label} actuation`, settings.actuation, 1, 10),
    integerRangeError(`${label} rapid trigger`, settings.rapidTrigger, 1, 5),
    integerRangeError(`${label} haptics`, settings.haptics, 0, 5),
  ].filter((error): error is string => error !== null);
}

export function validateSuperstrikeSettings(input: SuperstrikeSettings): ValidationResult {
  const errors = [...validateButton('Left', input.left), ...validateButton('Right', input.right)];
  return { ok: errors.length === 0, errors };
}

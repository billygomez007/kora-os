import {
  registerDecorator,
  type ValidationOptions,
} from 'class-validator';

/**
 * Zero-dependency IANA identifier check: `Intl.DateTimeFormat` throws a
 * `RangeError` for an unrecognized `timeZone` value, which is exactly the
 * validation Node's ICU data already performs — no separate timezone
 * database dependency needed.
 */
export function isValidIanaTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return false;
  }
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** class-validator decorator wrapping isValidIanaTimeZone. */
export function IsIanaTimeZone(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isIanaTimeZone',
      target: object.constructor,
      propertyName,
      options: {
        message: `${propertyName} must be a valid IANA time zone identifier (e.g. "Africa/Accra")`,
        ...validationOptions,
      },
      validator: {
        validate: (value: unknown) => isValidIanaTimeZone(value),
      },
    });
  };
}

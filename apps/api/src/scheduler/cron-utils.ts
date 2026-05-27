type CronFieldSpec = {
  name: string;
  min: number;
  max: number;
  allowSevenAsSunday?: boolean;
};

type ParsedCron = {
  expression: string;
  minute: Set<number>;
  hour: Set<number>;
  dayOfMonth: Set<number>;
  month: Set<number>;
  dayOfWeek: Set<number>;
};

type CronValidationResult = {
  valid: boolean;
  errors: string[];
};

const CRON_FIELD_SPECS: CronFieldSpec[] = [
  { name: 'minute', min: 0, max: 59 },
  { name: 'hour', min: 0, max: 23 },
  { name: 'dayOfMonth', min: 1, max: 31 },
  { name: 'month', min: 1, max: 12 },
  { name: 'dayOfWeek', min: 0, max: 6, allowSevenAsSunday: true },
];

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function validateCronExpression(expression: string): CronValidationResult {
  try {
    parseCronExpression(expression);
    return { valid: true, errors: [] };
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : 'Invalid cron expression'],
    };
  }
}

export function validateTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function computeNextRunAt(
  cronExpression: string,
  timezone: string,
  fromDate: Date,
): Date | null {
  const parsed = parseCronExpression(cronExpression);
  if (!validateTimezone(timezone)) {
    throw new Error('Invalid schedule timezone');
  }

  const cursor = new Date(fromDate);
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1);

  for (let i = 0; i < 60 * 24 * 366; i += 1) {
    if (matchesCron(cursor, parsed, timezone)) {
      return new Date(cursor);
    }
    cursor.setMinutes(cursor.getMinutes() + 1);
  }

  return null;
}

export function parseCronExpression(expression: string): ParsedCron {
  const normalized = expression.trim().replace(/\s+/g, ' ');
  if (normalized.length === 0) {
    throw new Error('Cron expression is required');
  }

  const fields = normalized.split(' ');
  if (fields.length !== 5) {
    throw new Error(
      'Cron expression must use 5 fields (minute hour day-of-month month day-of-week)',
    );
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields;

  return {
    expression: normalized,
    minute: parseField(minute, CRON_FIELD_SPECS[0]),
    hour: parseField(hour, CRON_FIELD_SPECS[1]),
    dayOfMonth: parseField(dayOfMonth, CRON_FIELD_SPECS[2]),
    month: parseField(month, CRON_FIELD_SPECS[3]),
    dayOfWeek: parseField(dayOfWeek, CRON_FIELD_SPECS[4]),
  };
}

function parseField(value: string, spec: CronFieldSpec): Set<number> {
  const segments = value.split(',');
  const result = new Set<number>();

  for (const segment of segments) {
    const trimmed = segment.trim();
    if (trimmed.length === 0) {
      throw new Error(`Cron ${spec.name} field has an empty segment`);
    }

    if (trimmed === '*') {
      addRange(result, spec.min, spec.max, 1, spec);
      continue;
    }

    const stepMatch = trimmed.match(/^(.+)\/(\d+)$/);
    if (stepMatch) {
      const stepBase = stepMatch[1];
      const step = Number(stepMatch[2]);
      if (!Number.isInteger(step) || step <= 0) {
        throw new Error(`Cron ${spec.name} field has invalid step value`);
      }

      if (stepBase === '*') {
        addRange(result, spec.min, spec.max, step, spec);
        continue;
      }

      const range = parseRange(stepBase, spec);
      addRange(result, range.start, range.end, step, spec);
      continue;
    }

    if (trimmed.includes('-')) {
      const range = parseRange(trimmed, spec);
      addRange(result, range.start, range.end, 1, spec);
      continue;
    }

    const singleValue = parseFieldValue(trimmed, spec);
    result.add(singleValue);
  }

  if (result.size === 0) {
    throw new Error(`Cron ${spec.name} field resolved to empty set`);
  }

  return result;
}

function parseRange(value: string, spec: CronFieldSpec) {
  const [startRaw, endRaw] = value.split('-');
  if (startRaw === undefined || endRaw === undefined) {
    throw new Error(`Cron ${spec.name} field has invalid range`);
  }
  const start = parseFieldValue(startRaw, spec);
  const end = parseFieldValue(endRaw, spec);
  if (end < start) {
    throw new Error(`Cron ${spec.name} range end must be >= start`);
  }
  return { start, end };
}

function parseFieldValue(raw: string, spec: CronFieldSpec): number {
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    throw new Error(`Cron ${spec.name} field must contain integers`);
  }

  if (spec.allowSevenAsSunday && value === 7) {
    return 0;
  }

  if (value < spec.min || value > spec.max) {
    throw new Error(
      `Cron ${spec.name} field value ${value} is out of range (${spec.min}-${spec.max})`,
    );
  }

  return value;
}

function addRange(
  target: Set<number>,
  start: number,
  end: number,
  step: number,
  spec: CronFieldSpec,
) {
  if (step <= 0) {
    throw new Error(`Cron ${spec.name} field has invalid step value`);
  }

  for (let value = start; value <= end; value += step) {
    target.add(value);
  }
}

function matchesCron(date: Date, parsed: ParsedCron, timezone: string): boolean {
  const parts = getZonedDateParts(date, timezone);
  return (
    parsed.minute.has(parts.minute) &&
    parsed.hour.has(parts.hour) &&
    parsed.dayOfMonth.has(parts.dayOfMonth) &&
    parsed.month.has(parts.month) &&
    parsed.dayOfWeek.has(parts.dayOfWeek)
  );
}

function getZonedDateParts(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    minute: '2-digit',
    hour: '2-digit',
    day: '2-digit',
    month: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  });

  const parts = formatter.formatToParts(date);
  const partMap: Record<string, string> = {};
  for (const part of parts) {
    partMap[part.type] = part.value;
  }

  const weekdayRaw = partMap.weekday;
  const dayOfWeek = weekdayRaw ? WEEKDAY_MAP[weekdayRaw] : undefined;
  if (dayOfWeek === undefined) {
    throw new Error(`Unable to resolve weekday for timezone "${timezone}"`);
  }

  return {
    minute: Number(partMap.minute),
    hour: Number(partMap.hour),
    dayOfMonth: Number(partMap.day),
    month: Number(partMap.month),
    dayOfWeek,
  };
}

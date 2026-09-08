const plainDateOrMonth = /^\d{4}-\d{2}(?:-\d{2})?$/;

const dateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

/**
 * Formats an API timestamp for people without changing date-only and month values
 * that are intentionally used as business periods or form values.
 */
export const formatDateTime = (value: string | null | undefined, fallback = '—') => {
  if (!value) return fallback;
  if (plainDateOrMonth.test(value)) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : dateTimeFormatter.format(date);
};

/** Formats an API date-time as a business date for visible date ranges and tables. */
export const formatDateOnly = (value: string | null | undefined, fallback = '—') => {
  if (!value) return fallback;
  if (plainDateOrMonth.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

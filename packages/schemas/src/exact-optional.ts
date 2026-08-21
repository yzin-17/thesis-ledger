type OptionalKeys<T extends object> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? K : never;
}[keyof T];

type RequiredKeys<T extends object> = Exclude<keyof T, OptionalKeys<T>>;

export type ExactOptional<T> = T extends readonly (infer Item)[]
  ? ExactOptional<Item>[]
  : T extends Date
    ? T
    : T extends object
      ? { [K in RequiredKeys<T>]: ExactOptional<T[K]> } & {
          [K in OptionalKeys<T>]?: ExactOptional<Exclude<T[K], undefined>>;
        }
      : Exclude<T, undefined>;

export const omitUndefinedDeep = <T>(value: T): ExactOptional<T> => {
  if (Array.isArray(value)) {
    return value.map((item) => omitUndefinedDeep(item)) as ExactOptional<T>;
  }
  if (value instanceof Date) return value as ExactOptional<T>;
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (entry !== undefined) result[key] = omitUndefinedDeep(entry);
    }
    return result as ExactOptional<T>;
  }
  return value as ExactOptional<T>;
};

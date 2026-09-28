if (typeof window !== "undefined") {
  throw new Error("Infrastructure adapters may only run on the server.");
}

export function requireValue(value: string, name: string): string {
  if (!value.trim()) throw new Error(`Missing required configuration: ${name}`);
  return value;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function postJson(
  url: string,
  body: unknown,
  headers: Record<string, string>,
): Promise<unknown> {
  let lastError = "no response";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    if (response.ok) {
      return JSON.parse(text) as unknown;
    }
    lastError = `${response.status} ${text.slice(0, 500)}`;
    if (response.status !== 429 && response.status < 500) {
      throw new Error(lastError);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
  }
  throw new Error(lastError);
}

export function chromaBase(): string {
  const host = process.env.CHROMA_HOST ?? "localhost";
  const port = process.env.CHROMA_PORT ?? "8000";
  return `http://${host}:${port}/api/v2/tenants/default_tenant/databases/default_database/collections`;
}

export function bearer(name: string): Record<string, string> {
  const value = process.env[name] ?? "";
  if (value.length === 0) {
    throw new Error(`${name} is missing`);
  }
  return { authorization: `Bearer ${value}` };
}

export function decimal(value: number): string {
  return value.toFixed(4);
}

export function field(name: string, value: string | number | null): void {
  console.log(`${name}: ${value === null ? "unavailable" : value}`);
}

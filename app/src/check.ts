const keyNames = ["OPENROUTER_API_KEY", "JEV_API_KEY"] as const;

export async function runCheck(): Promise<number> {
  for (const name of keyNames) {
    const value = process.env[name] ?? "";
    console.log(`${name}: ${value.length > 0 ? "set" : "missing"}`);
  }

  const host = process.env.CHROMA_HOST ?? "localhost";
  const port = process.env.CHROMA_PORT ?? "8000";
  const url = `http://${host}:${port}/api/v2/heartbeat`;

  const deadline = Date.now() + 30_000;
  let lastError = "no response";

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        console.log(`chroma: ok ${url}`);
        return 0;
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "connection failed";
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.error(`chroma: failed ${url} (${lastError})`);
  return 1;
}

import { readPublic } from "./collector.mjs";

const unreachableCodes = new Set([
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "UND_ERR_CONNECT_TIMEOUT",
]);

export async function checkLink(url, reader = readPublic, signal) {
  try {
    await reader(url, signal, { maxBytes: 128 * 1024 });
    return "ok";
  } catch (error) {
    const message = String(error?.message || "");
    if (message.includes("허용 크기를 초과")) return "ok";
    const status = Number(message.match(/^HTTP (\d{3})/)?.[1]);
    // Bot blocks (401/403/429) do not prove the post is gone.
    if (status)
      return status === 404 || status === 410 || status >= 500
        ? "broken"
        : "unknown";
    const code = error?.code || error?.cause?.code;
    if (unreachableCodes.has(code)) return "broken";
    return "unknown";
  }
}

export async function checkLinks(urls, reader = readPublic, signal) {
  const results = new Array(urls.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, urls.length) }, async () => {
      while (next < urls.length) {
        const position = next++;
        signal?.throwIfAborted();
        results[position] = await checkLink(
          urls[position],
          reader,
          signal
            ? AbortSignal.any([signal, AbortSignal.timeout(10000)])
            : AbortSignal.timeout(10000),
        );
      }
    }),
  );
  return results;
}

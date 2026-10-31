import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { randomUUID } from "node:crypto";
import Parser from "rss-parser";
import ipaddr from "ipaddr.js";
import { Agent, fetch } from "undici";
import { addItems } from "./core.mjs";

export function publicAddress(address) {
  try {
    return ipaddr.process(address).range() === "unicast";
  } catch {
    return false;
  }
}

export async function validateFeedUrl(value, signal) {
  signal?.throwIfAborted();
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  )
    throw new Error("공개 HTTPS RSS 주소만 허용됩니다.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  let records;
  if (isIP(host)) records = [{ address: host, family: isIP(host) }];
  else {
    const timeout = AbortSignal.timeout(10000);
    const cancellation = signal ? AbortSignal.any([signal, timeout]) : timeout;
    let onAbort;
    try {
      records = await Promise.race([
        lookup(host, { all: true }),
        new Promise((_resolve, reject) => {
          onAbort = () => reject(cancellation.reason);
          cancellation.addEventListener("abort", onAbort, { once: true });
        }),
      ]);
    } finally {
      cancellation.removeEventListener("abort", onAbort);
    }
  }
  if (
    !records.length ||
    records.some((record) => !publicAddress(record.address))
  )
    throw new Error("로컬 및 내부 네트워크 주소는 사용할 수 없습니다.");
  return { url, records };
}

export async function readPublic(value, signal, options = {}) {
  let target = value;
  for (let hop = 0; hop < 4; hop++) {
    const { url, records } = await validateFeedUrl(target, signal);
    const agent = new Agent({
      connect: {
        timeout: 10000,
        lookup: (_host, options, callback) =>
          options.all
            ? callback(null, records)
            : callback(null, records[0].address, records[0].family),
      },
    });
    try {
      const response = await fetch(url, {
        dispatcher: agent,
        redirect: "manual",
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
          : AbortSignal.timeout(15000),
        headers: {
          "user-agent": "ReputationMonitor/1.0 (public search reader)",
          accept:
            options.accept || "text/html,application/json;q=0.9,*/*;q=0.8",
          ...options.headers,
        },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location) throw new Error("잘못된 리디렉션입니다.");
        if (
          options.headers &&
          new URL(location, url).origin !== new URL(value).origin
        )
          throw new Error("인증 요청의 외부 리디렉션을 차단했습니다.");
        target = new URL(location, url).href;
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`HTTP ${response.status}`);
      }
      let size = 0;
      const chunks = [];
      for await (const chunk of response.body) {
        size += chunk.byteLength;
        if (size > (options.maxBytes || 2 * 1024 * 1024)) {
          await response.body.cancel().catch(() => {});
          throw new Error("응답이 허용 크기를 초과했습니다.");
        }
        chunks.push(Buffer.from(chunk));
      }
      return {
        text: Buffer.concat(chunks).toString("utf8"),
        url: url.href,
        contentType: response.headers.get("content-type") || "",
      };
    } finally {
      await agent.close();
    }
  }
  throw new Error("리디렉션 횟수를 초과했습니다.");
}

export async function readFeed(value, signal) {
  const response = await readPublic(value, signal, {
    accept:
      "application/rss+xml, application/atom+xml, application/xml, text/xml",
  });
  return new Parser().parseString(response.text);
}

export function newsUrl(keyword) {
  const target = [keyword.name, ...keyword.aliases]
    .map((word) => `"${word.replaceAll('"', "")}"`)
    .join(" OR ");
  const negative = (keyword.negativeWords || [])
    .map((word) => `"${word.replaceAll('"', "")}"`)
    .join(" OR ");
  const query = negative ? `(${target}) (${negative})` : target;
  const url = new URL("https://news.google.com/rss/search");
  url.search = new URLSearchParams({
    q: query,
    hl: "ko",
    gl: "KR",
    ceid: "KR:ko",
  }).toString();
  return url.href;
}

export class Collector {
  constructor(store, feedReader = readFeed) {
    this.store = store;
    this.feedReader = feedReader;
    this.running = false;
    this.progress = null;
  }
  cancel() {
    this.controller?.abort();
  }
  async run() {
    if (this.running || this.searching) throw new Error("이미 수집 중입니다.");
    if (!this.store.state.keywords.some((keyword) => keyword.enabled))
      throw new Error("활성 검색 키워드를 먼저 등록하세요.");
    this.running = true;
    this.controller = new AbortController();
    const run = {
      id: randomUUID(),
      startedAt: new Date().toISOString(),
      finishedAt: null,
      added: 0,
      errors: [],
      feeds: 0,
    };
    const feeds = [
      ...this.store.state.keywords
        .filter((keyword) => keyword.enabled)
        .map((keyword) => ({
          name: `Google 뉴스 · ${keyword.name}`,
          url: newsUrl(keyword),
        })),
      ...this.store.state.sources.filter((source) => source.enabled),
    ];
    try {
      this.store.update((state) => {
        state.runs.unshift(run);
        state.runs = state.runs.slice(0, 100);
      });
      this.progress = {
        total: feeds.length,
        completed: 0,
        current: "",
        added: 0,
      };
      for (const feed of feeds) {
        if (this.controller.signal.aborted) break;
        this.progress.current = feed.name;
        try {
          const parsed = await this.feedReader(
            feed.url,
            this.controller.signal,
          );
          if (this.controller.signal.aborted) break;
          this.store.update((state) => {
            run.added += addItems(
              state,
              parsed.items.slice(0, 200),
              feed.name,
              new Date(),
              { negativeOnly: true },
            );
            run.feeds++;
            Object.assign(
              state.runs.find((item) => item.id === run.id),
              run,
            );
          });
        } catch (error) {
          if (this.controller.signal.aborted) break;
          run.errors.push(`${feed.name}: ${error.message}`);
          this.store.update((state) =>
            Object.assign(
              state.runs.find((item) => item.id === run.id),
              run,
            ),
          );
        }
        this.progress.completed++;
        this.progress.added = run.added;
      }
      if (this.controller.signal.aborted)
        run.errors.push(
          "사용자가 수집을 취소했습니다. 완료된 결과는 보존됩니다.",
        );
      run.finishedAt = new Date().toISOString();
      this.store.update((state) => {
        Object.assign(
          state.runs.find((item) => item.id === run.id),
          run,
        );
        state.lastCollectedAt = run.finishedAt;
      });
      return run;
    } finally {
      this.running = false;
      this.progress = null;
      this.controller = null;
    }
  }
}

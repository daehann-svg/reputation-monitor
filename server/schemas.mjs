import { z } from "zod";
import { defaults, reviewCandidates, contentFingerprint } from "./core.mjs";

const word = z.string().trim().min(1).max(100);
const words = z.array(word).max(100);
const id = z.string().min(1).max(100);
export const mediaEnum = z.enum([
  "naver",
  "naver_news",
  "google",
  "youtube",
  "tiktok",
  "instagram",
  "x",
  "threads",
  "naver_blog",
  "naver_cafe",
  "daum_cafe",
  "fmkorea",
  "dcinside",
  "ppomppu",
  "ruliweb",
  "clien",
  "bobaedream",
  "theqoo",
  "instiz",
  "natepann",
  "yeosingsidae",
  "arcalive",
]);
export const reportStatusEnum = z.enum([
  "planned",
  "reporting",
  "delete_pending",
  "deleted",
]);
export const reportImageSchema = z.object({
  id,
  name: z.string().trim().min(1).max(200),
  dataUrl: z
    .string()
    .max(1500000)
    .refine(
      (value) => /^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(value),
      "이미지 데이터 형식이 올바르지 않습니다.",
    ),
});
export const reportDraftSchema = z.object({
  title: z.string().trim().min(1).max(500),
  content: z.string().max(50000).default(""),
  status: reportStatusEnum.default("planned"),
  category: z.string().trim().max(100).default("권리침해·명예훼손 신고"),
  targetUrl: z.string().max(4096).default(""),
  reportUrl: z.string().max(4096).default(""),
  platform: z.string().max(100).default(""),
  mentionId: z.string().max(100).nullable().default(null),
  images: z.array(reportImageSchema).max(5).default([]),
});
const storedReportDraftSchema = reportDraftSchema.extend({
  id,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export const keywordSchema = z.object({
  name: word,
  aliases: words.default([]),
  excludes: words.default([]),
  negativeWords: words.max(10).default(defaults.negativeWords.slice(0, 3)),
  enabled: z.boolean().default(true),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#087f73"),
});
export const settingsSchema = z.object({
  organization: z.string().trim().min(1).max(100),
  autoCollect: z.boolean(),
  intervalMinutes: z.number().int().min(5).max(1440),
  retentionDays: z.number().int().min(1).max(365),
  alertThreshold: z.number().int().min(1).max(10),
  alertEnabled: z.boolean(),
  positiveWords: words,
  negativeWords: words,
});
export const sourceSchema = z.object({
  name: word,
  url: z
    .string()
    .url()
    .max(2048)
    .refine(
      (value) => value.startsWith("https://"),
      "HTTPS 주소만 사용할 수 있습니다.",
    ),
  enabled: z.boolean().default(true),
});
const reviewSchema = z
  .object({
    decision: z.enum(["unreviewed", "checking", "source_checked", "excluded"]),
    quote: z.string().max(5000),
    context: z.string().max(5000),
    reviewer: z.string().trim().max(100),
    checkedAt: z.string().datetime().nullable(),
  })
  .strict()
  .superRefine((review, context) => {
    if (
      review.decision === "source_checked" &&
      (!review.quote.trim() || !review.reviewer || !review.checkedAt)
    )
      context.addIssue({
        code: "custom",
        message: "원문 확인에는 인용문, 확인자, 확인 시각이 필요합니다.",
      });
    if (review.checkedAt && Date.parse(review.checkedAt) > Date.now())
      context.addIssue({
        code: "custom",
        message: "확인 시각은 미래일 수 없습니다.",
      });
  });
export const mentionPatchSchema = z
  .object({
    status: z.enum(["new", "reviewing", "resolved", "ignored"]).optional(),
    sentiment: z.enum(["positive", "neutral", "negative"]).optional(),
    starred: z.boolean().optional(),
    note: z.string().max(5000).optional(),
    assignee: z.string().trim().max(100).optional(),
    tags: z.array(word).max(20).optional(),
    priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
    dueAt: z.string().datetime().nullable().optional(),
    review: reviewSchema.optional(),
    reportStatus: reportStatusEnum.nullable().optional(),
  })
  .strict();
export const filterSchema = z.object({
  query: z.string().max(500).default(""),
  sentiment: z.enum(["all", "positive", "neutral", "negative"]).default("all"),
  status: z
    .enum(["all", "pending", "new", "reviewing", "resolved", "ignored"])
    .default("all"),
  keyword: z.string().max(100).default("all"),
  source: z.string().max(1000).default("all"),
  days: z.enum(["all", "1", "7", "14", "30"]).default("all"),
  starred: z.boolean().default(false),
  dataType: z.enum(["all", "real", "demo"]).default("all"),
  priority: z
    .enum(["all", "low", "normal", "high", "urgent", "overdue"])
    .default("all"),
  review: z
    .enum([
      "all",
      "candidates",
      "unreviewed",
      "checking",
      "source_checked",
      "excluded",
    ])
    .default("all"),
  duplicates: z.enum(["all", "content", "repeated_url"]).default("all"),
  reportStatus: z
    .enum(["all", "none", "planned", "reporting", "delete_pending", "deleted"])
    .default("all"),
});
export const viewSchema = z.object({ name: word, filters: filterSchema });
const mentionSchema = z
  .object({
    id,
    title: z.string().max(8000),
    summary: z.string().max(8000),
    url: z
      .string()
      .url()
      .max(4096)
      .refine((value) => /^https?:\/\//.test(value)),
    source: z.string().max(1000),
    keywordIds: z.array(id).max(30),
    publishedAt: z.string().datetime(),
    collectedAt: z.string().datetime(),
    sentiment: z.enum(["positive", "neutral", "negative"]),
    score: z.number().min(-100).max(100),
    evidence: words,
    status: z.enum(["new", "reviewing", "resolved", "ignored"]),
    starred: z.boolean(),
    note: z.string().max(5000),
    assignee: z.string().max(100),
    tags: z.array(word).max(20),
    demo: z.boolean(),
    manualSentiment: z.boolean().default(false),
    priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
    dueAt: z.string().datetime().nullable().default(null),
    searchQuery: z.string().max(200).default(""),
    medium: mediaEnum.nullable().default(null),
    dateBasis: z.enum(["published", "collected"]).default("published"),
    contentKey: z.string().max(100).default(""),
    seenCount: z.number().int().min(1).max(1000000000).default(1),
    lastSeenAt: z.string().datetime().nullable().default(null),
    matchedNegativeWords: words.default([]),
    reportStatus: reportStatusEnum.nullable().default(null),
    linkStatus: z.enum(["ok", "broken", "unknown"]).nullable().default(null),
    linkCheckedAt: z.string().datetime().nullable().default(null),
    reviewCandidates: z
      .array(
        z.object({
          category: z.string().max(100),
          term: word,
          excerpt: z.string().max(300),
        }),
      )
      .max(30)
      .default([]),
    review: reviewSchema.default({
      decision: "unreviewed",
      quote: "",
      context: "",
      reviewer: "",
      checkedAt: null,
    }),
  })
  .transform((mention) => ({
    ...mention,
    reviewCandidates: reviewCandidates(`${mention.title} ${mention.summary}`),
    contentKey: contentFingerprint(mention.title, mention.summary, mention.url),
    lastSeenAt: mention.lastSeenAt || mention.collectedAt,
  }));
export const backupSchema = z
  .object({
    version: z.literal(1),
    settings: settingsSchema.default(defaults),
    keywords: z.array(keywordSchema.extend({ id })).max(30),
    sources: z.array(sourceSchema.extend({ id })).max(50),
    mentions: z.array(mentionSchema).max(20000),
    alerts: z
      .array(
        z.object({
          id,
          mentionId: id,
          title: z.string().max(8000),
          createdAt: z.string().datetime(),
          read: z.boolean(),
        }),
      )
      .max(1000),
    runs: z
      .array(
        z.object({
          id,
          startedAt: z.string().datetime(),
          finishedAt: z.string().datetime().nullable(),
          added: z.number().int().min(0),
          errors: z.array(z.string().max(5000)).max(100),
          feeds: z.number().int().min(0),
          kind: z.enum(["search", "collection"]).optional(),
          query: z.string().max(200).optional(),
        }),
      )
      .max(100),
    lastCollectedAt: z.string().datetime().nullable(),
    savedViews: z.array(viewSchema.extend({ id })).max(30).default([]),
    reports: z.array(storedReportDraftSchema).max(500).default([]),
  })
  .superRefine((state, context) => {
    for (const key of [
      "keywords",
      "sources",
      "mentions",
      "alerts",
      "runs",
      "savedViews",
      "reports",
    ]) {
      const ids = state[key].map((item) => item.id);
      if (new Set(ids).size !== ids.length)
        context.addIssue({
          code: "custom",
          message: `${key}: 중복 ID가 있습니다.`,
        });
    }
  });

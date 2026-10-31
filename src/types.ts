export type Sentiment = "positive" | "neutral" | "negative";
export type Status = "new" | "reviewing" | "resolved" | "ignored";
export type ReportStatus =
  "planned" | "reporting" | "delete_pending" | "deleted";
export type Page =
  | "overview"
  | "mentions"
  | "search"
  | "keywords"
  | "reports"
  | "alerts"
  | "settings";
export type SearchMedium =
  | "naver"
  | "naver_news"
  | "google"
  | "youtube"
  | "tiktok"
  | "instagram"
  | "x"
  | "threads"
  | "naver_blog"
  | "naver_cafe"
  | "daum_cafe"
  | "fmkorea"
  | "dcinside"
  | "ppomppu"
  | "ruliweb"
  | "clien"
  | "bobaedream"
  | "theqoo"
  | "instiz"
  | "natepann"
  | "yeosingsidae"
  | "arcalive";
export interface ReportImage {
  id: string;
  name: string;
  dataUrl: string;
}
export interface ReportDraft {
  id: string;
  title: string;
  content: string;
  status: ReportStatus;
  category: string;
  targetUrl: string;
  reportUrl: string;
  platform: string;
  mentionId: string | null;
  images: ReportImage[];
  createdAt: string;
  updatedAt: string;
}
export interface ReviewCandidate {
  category: string;
  term: string;
  excerpt: string;
}
export interface SourceReview {
  decision: "unreviewed" | "checking" | "source_checked" | "excluded";
  quote: string;
  context: string;
  reviewer: string;
  checkedAt: string | null;
}
export interface MediaSearchResult {
  query: string;
  media: SearchMedium[];
  startDate: string;
  endDate: string;
  searchedAt: string;
  saved: number;
  saveResults: boolean;
  negativeWords: string[];
  duplicateGroups: number;
  platforms: {
    id: SearchMedium;
    name: string;
    nativeUrl: string;
    periodUrl: string;
    nativePeriod: boolean;
    mode: "rss" | "api" | "html" | "index";
    error: string | null;
    warnings: string[];
    saved: number;
    duplicates: number;
    skipped: number;
    results: {
      title: string;
      summary: string;
      url: string;
      publishedAt: string | null;
      dateVerified: boolean;
      reviewCandidates: ReviewCandidate[];
      contentKey: string;
      contentCopies: number;
      matchedNegativeWords: string[];
    }[];
  }[];
}
export interface Keyword {
  id: string;
  name: string;
  aliases: string[];
  excludes: string[];
  negativeWords: string[];
  enabled: boolean;
  color: string;
}
export interface Source {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
}
export interface Settings {
  organization: string;
  autoCollect: boolean;
  intervalMinutes: number;
  retentionDays: number;
  alertThreshold: number;
  alertEnabled: boolean;
  positiveWords: string[];
  negativeWords: string[];
}
export interface Mention {
  id: string;
  title: string;
  summary: string;
  url: string;
  source: string;
  keywordIds: string[];
  publishedAt: string;
  collectedAt: string;
  sentiment: Sentiment;
  score: number;
  evidence: string[];
  status: Status;
  starred: boolean;
  note: string;
  assignee: string;
  tags: string[];
  demo: boolean;
  manualSentiment?: boolean;
  priority?: "low" | "normal" | "high" | "urgent";
  dueAt?: string | null;
  searchQuery?: string;
  medium?: SearchMedium | null;
  dateBasis?: "published" | "collected";
  reviewCandidates?: ReviewCandidate[];
  review?: SourceReview;
  contentKey?: string;
  seenCount?: number;
  lastSeenAt?: string;
  matchedNegativeWords?: string[];
  reportStatus?: ReportStatus | null;
  linkStatus?: "ok" | "broken" | "unknown" | null;
  linkCheckedAt?: string | null;
}
export interface Filters {
  query: string;
  sentiment: string;
  status: string;
  keyword: string;
  source: string;
  days: string;
  starred: boolean;
  dataType: string;
  priority: string;
  review: string;
  duplicates: string;
  reportStatus?: string;
}
export interface SavedView {
  id: string;
  name: string;
  filters: Filters;
}
export interface Alert {
  id: string;
  mentionId: string;
  title: string;
  createdAt: string;
  read: boolean;
}
export interface Run {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  added: number;
  errors: string[];
  feeds: number;
}
export interface AppState {
  version: number;
  settings: Settings;
  keywords: Keyword[];
  sources: Source[];
  mentions: Mention[];
  alerts: Alert[];
  runs: Run[];
  lastCollectedAt: string | null;
  collecting: boolean;
  searching?: boolean;
  savedViews: SavedView[];
  reports?: ReportDraft[];
  progress: {
    total: number;
    completed: number;
    current: string;
    added: number;
  } | null;
}
export type Mutation = (
  path: string,
  method: string,
  body?: unknown,
  message?: string,
) => Promise<boolean>;
export type Notify = (message: string, error?: boolean) => void;

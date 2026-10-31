import { useState } from "react";
import {
  Activity,
  ArrowRight,
  Clock3,
  Inbox,
  MessageSquare,
  Play,
  Plus,
  Radio,
  Search,
  Tag,
  TrendingUp,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AppState } from "../types";
import { formatDate } from "../api";
import { Empty, SentimentBadge, statuses } from "./Shared";

export function Dashboard({
  state,
  now,
  onMentions,
  onDetail,
  onKeyword,
  demo,
}: {
  state: AppState;
  now: number;
  onMentions: (preset?: string, days?: number) => void;
  onDetail: (id: string) => void;
  onKeyword: () => void;
  demo: () => void;
}) {
  const [days, setDays] = useState(7);
  const mentions = state.mentions.filter(
    (mention) =>
      mention.dateBasis !== "collected" &&
      new Date(mention.publishedAt).getTime() >= now - days * 86400000,
  );
  const negative = mentions.filter(
    (mention) => mention.sentiment === "negative",
  );
  const positive = mentions.filter(
    (mention) => mention.sentiment === "positive",
  );
  const pending = negative.filter((mention) =>
    ["new", "reviewing"].includes(mention.status),
  );
  const trend = Array.from({ length: days }, (_, index) => {
    const date = new Date(now);
    date.setDate(date.getDate() - days + index + 1);
    date.setHours(0, 0, 0, 0);
    const bucket = state.mentions.filter((mention) => {
      const time = new Date(mention.publishedAt).getTime();
      return mention.dateBasis !== "collected" && time >= date.getTime() && time < date.getTime() + 86400000;
    });
    return {
      date: `${date.getMonth() + 1}.${date.getDate()}`,
      긍정: bucket.filter((mention) => mention.sentiment === "positive").length,
      중립: bucket.filter((mention) => mention.sentiment === "neutral").length,
      부정: bucket.filter((mention) => mention.sentiment === "negative").length,
    };
  });
  if (!state.keywords.length && !state.mentions.length)
    return (
      <div className="welcome">
        <div className="welcome-visual">
          <Radio size={62} strokeWidth={1} />
        </div>
        <div className="eyebrow">YOUR REPUTATION, IN FOCUS</div>
        <h2>모니터링할 브랜드를 등록하세요</h2>
        <div className="welcome-actions">
          <button className="primary" onClick={onKeyword}>
            <Plus size={17} />첫 키워드 등록
          </button>
          <button onClick={demo}>
            <Play size={16} />
            체험 데이터 열기
          </button>
        </div>
        <div className="onboarding-summary">
          <span>
            <Search size={18} />
            키워드
          </span>
          <ArrowRight size={16} />
          <span>
            <Radio size={18} />
            뉴스·RSS
          </span>
          <ArrowRight size={16} />
          <span>
            <Inbox size={18} />
            평판 현황
          </span>
        </div>
      </div>
    );
  return (
    <>
      <div className="section-toolbar">
        <span className="subtle">
          <Clock3 size={15} />
          게시일 기준
        </span>
        <div className="segmented" aria-label="조회 기간">
          {[7, 14, 30].map((value) => (
            <button
              key={value}
              aria-pressed={days === value}
              className={days === value ? "selected" : ""}
              onClick={() => setDays(value)}
            >
              최근 {value}일
            </button>
          ))}
        </div>
      </div>
      <section className="metrics" aria-label="평판 요약">
        <button className="metric" onClick={() => onMentions("all", days)}>
          <span>
            전체 언급
            <MessageSquare size={18} />
          </span>
          <strong>
            {mentions.length.toLocaleString()}
            <small>건</small>
          </strong>
          <div>최근 {days}일 게시물</div>
        </button>
        <button className="metric" onClick={() => onMentions("positive", days)}>
          <span>
            긍정 비율
            <TrendingUp size={18} />
          </span>
          <strong className="green-text">
            {mentions.length
              ? Math.round((positive.length / mentions.length) * 100)
              : 0}
            <small>%</small>
          </strong>
          <div>긍정 언급 {positive.length}건</div>
        </button>
        <button className="metric" onClick={() => onMentions("negative", days)}>
          <span>
            부정 언급
            <Activity size={18} />
          </span>
          <strong className="red-text">
            {negative.length}
            <small>건</small>
          </strong>
          <div>
            전체의{" "}
            {mentions.length
              ? Math.round((negative.length / mentions.length) * 100)
              : 0}
            %
          </div>
        </button>
        <button className="metric" onClick={() => onMentions("pending", days)}>
          <span>
            대응 대기
            <Clock3 size={18} />
          </span>
          <strong className="amber-text">
            {pending.length}
            <small>건</small>
          </strong>
          <div>미처리 부정 언급</div>
        </button>
      </section>
      <div className="overview-grid">
        <section>
          <div className="section-heading">
            <h2>언급 추이</h2>
            <div className="legend">
              <span>
                <i className="positive-color" />
                긍정
              </span>
              <span>
                <i className="neutral-color" />
                중립
              </span>
              <span>
                <i className="negative-color" />
                부정
              </span>
            </div>
          </div>
          <div
            className="trend-chart"
            role="img"
            aria-label={`최근 ${days}일 감정별 언급 추이`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={trend}
                margin={{ top: 20, right: 12, bottom: 0, left: -20 }}
              >
                <CartesianGrid
                  strokeDasharray="3 5"
                  vertical={false}
                  stroke="#e7eae9"
                />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11 }}
                  minTickGap={25}
                />
                <YAxis
                  allowDecimals={false}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 6,
                    border: "1px solid #e0e5e3",
                    fontSize: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="중립"
                  stroke="#9ba8b7"
                  fill="#9ba8b7"
                  fillOpacity={0.1}
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="긍정"
                  stroke="#138777"
                  fill="#138777"
                  fillOpacity={0.09}
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="부정"
                  stroke="#d3635d"
                  fill="#d3635d"
                  fillOpacity={0.05}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="keyword-ranking">
          <div className="section-heading">
            <h2>키워드별 언급</h2>
            <Tag size={17} />
          </div>
          <div className="ranking-list">
            {state.keywords
              .map((keyword) => ({
                ...keyword,
                count: mentions.filter((mention) =>
                  mention.keywordIds.includes(keyword.id),
                ).length,
              }))
              .sort((first, second) => second.count - first.count)
              .slice(0, 6)
              .map((keyword) => (
                <div className="ranking-row" key={keyword.id}>
                  <div>
                    <span
                      className="color-dot"
                      style={{ background: keyword.color }}
                    />
                    <strong>{keyword.name}</strong>
                    <span>{keyword.count}건</span>
                  </div>
                  <div className="bar-track">
                    <span
                      style={{
                        width: `${mentions.length ? (keyword.count / mentions.length) * 100 : 0}%`,
                        background: keyword.color,
                      }}
                    />
                  </div>
                </div>
              ))}
          </div>
          <div className="ranking-footer">
            활성 키워드{" "}
            {state.keywords.filter((keyword) => keyword.enabled).length} /{" "}
            {state.keywords.length}
          </div>
        </section>
      </div>
      <section className="recent-section">
        <div className="section-heading">
          <h2>
            최근 언급{" "}
            <span className="small-count">{state.mentions.length}</span>
          </h2>
          <button className="text-button" onClick={() => onMentions()}>
            전체 보기
            <ArrowRight size={15} />
          </button>
        </div>
        {state.mentions.length ? (
          <div className="recent-list">
            {[...state.mentions]
              .sort((first, second) =>
                second.publishedAt.localeCompare(first.publishedAt),
              )
              .slice(0, 5)
              .map((mention) => (
                <button
                  className="recent-row"
                  key={mention.id}
                  onClick={() => onDetail(mention.id)}
                >
                  <SentimentBadge mention={mention} />
                  <div>
                    <strong>{mention.title}</strong>
                    <small>
                      {mention.source} · {mention.dateBasis === "collected" ? "게시일 미확인" : formatDate(mention.publishedAt)}{" "}
                      {mention.demo && "· 체험"}
                    </small>
                  </div>
                  <span className={`status-text ${mention.status}`}>
                    {statuses[mention.status]}
                  </span>
                  <ArrowRight size={15} />
                </button>
              ))}
          </div>
        ) : (
          <Empty title="아직 수집된 언급이 없습니다">
            <p>등록한 키워드의 뉴스를 조회하려면 지금 수집을 실행하세요.</p>
          </Empty>
        )}
      </section>
    </>
  );
}

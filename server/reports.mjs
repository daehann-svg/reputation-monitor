import { csvCell } from "./core.mjs";

const labels = {
  unreviewed: "미검토",
  checking: "원문 검토 중",
  source_checked: "원문 확인",
  excluded: "대상 아님",
  positive: "긍정",
  neutral: "중립",
  negative: "부정",
  new: "신규",
  reviewing: "검토 중",
  resolved: "처리 완료",
  ignored: "제외",
  low: "낮음",
  normal: "보통",
  high: "높음",
  urgent: "긴급",
  planned: "신고예정",
  reporting: "신고중",
  delete_pending: "삭제예정",
  deleted: "삭제완료",
};
function contentCopies(state) {
  const groups = new Map();
  for (const mention of state.mentions) {
    const key = mention.contentKey || mention.url;
    if (!groups.has(key)) groups.set(key, new Set());
    groups.get(key).add(mention.url);
  }
  return groups;
}
function collectionEvidence(mention, copies) {
  return `<p>감지 부정 키워드: ${escapeHtml((mention.matchedNegativeWords || []).join(", "))}</p><p>작업 공간 제목·요약 동일 ${copies.get(mention.contentKey || mention.url)?.size || 1}개 URL · URL 조회 ${mention.seenCount || 1}회 · 최근 확인 ${escapeHtml(mention.lastSeenAt || mention.collectedAt)}</p>`;
}
export function exportCsv(state, ids) {
  const copies = contentCopies(state);
  const rows = [
    [
      "게시일",
      "제목",
      "출처",
      "감정",
      "상태",
      "우선순위",
      "기한",
      "키워드",
      "담당자",
      "태그",
      "메모",
      "URL",
      "체험 데이터",
      "매체",
      "검색어",
      "게시일 확인",
      "수집일",
      "검토 후보 유형",
      "탐지 표현",
      "탐지 근거(제목·요약)",
      "원문 검토",
      "원문 인용문",
      "원문 맥락",
      "확인자",
      "원문 확인 시각",
      "감지 부정 키워드",
      "콘텐츠 그룹",
      "제목·요약 동일 URL 수",
      "URL 조회 횟수",
      "최근 확인 시각",
      "신고 상태",
    ],
    ...state.mentions
      .filter((mention) => !ids || ids.includes(mention.id))
      .map((mention) => [
        mention.dateBasis === "collected" ? "" : mention.publishedAt,
        mention.title,
        mention.source,
        labels[mention.sentiment],
        labels[mention.status],
        labels[mention.priority || "normal"],
        mention.dueAt,
        state.keywords
          .filter((keyword) => mention.keywordIds.includes(keyword.id))
          .map((keyword) => keyword.name)
          .join(", "),
        mention.assignee,
        mention.tags.join(", "),
        mention.note,
        mention.url,
        mention.demo ? "예" : "아니오",
        mention.medium || "",
        mention.searchQuery || "",
        mention.dateBasis === "collected" ? "미확인" : "확인",
        mention.collectedAt,
        [
          ...new Set(
            (mention.reviewCandidates || []).map((item) => item.category),
          ),
        ].join("; "),
        (mention.reviewCandidates || []).map((item) => item.term).join("; "),
        (mention.reviewCandidates || []).map((item) => item.excerpt).join("; "),
        labels[mention.review?.decision || "unreviewed"],
        mention.review?.quote || "",
        mention.review?.context || "",
        mention.review?.reviewer || "",
        mention.review?.checkedAt || "",
        (mention.matchedNegativeWords || []).join(", "),
        mention.contentKey || "",
        copies.get(mention.contentKey || mention.url)?.size || 1,
        mention.seenCount || 1,
        mention.lastSeenAt || mention.collectedAt,
        mention.reportStatus ? labels[mention.reportStatus] || mention.reportStatus : "미신고",
      ]),
  ];
  return "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
export function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
}
export function exportReport(state, ids) {
  const copies = contentCopies(state);
  const mentions = state.mentions
    .filter((mention) => !ids || ids.includes(mention.id))
    .sort((first, second) =>
      second.publishedAt.localeCompare(first.publishedAt),
    );
  const summary = ["positive", "neutral", "negative"]
    .map(
      (sentiment) =>
        `<div><strong>${mentions.filter((mention) => mention.sentiment === sentiment).length}</strong><span>${labels[sentiment]}</span></div>`,
    )
    .join("");
  const rows = mentions
    .map(
      (mention) =>
        `<tr><td>${mention.dateBasis === "collected" ? "게시일 미확인" : escapeHtml(new Date(mention.publishedAt).toLocaleDateString("ko-KR"))}<p>수집 ${escapeHtml(mention.collectedAt)}</p></td><td><a href="${escapeHtml(mention.url)}" rel="noreferrer">${escapeHtml(mention.title)}</a>${mention.demo ? "<small>체험 데이터</small>" : ""}<p>수집 요약: ${escapeHtml(mention.summary)}</p>${collectionEvidence(mention, copies)}${mention.searchQuery ? `<p>검색어: ${escapeHtml(mention.searchQuery)}</p>` : ""}${mention.note ? `<p>메모: ${escapeHtml(mention.note)}</p>` : ""}<p>원문 검토: ${labels[mention.review?.decision || "unreviewed"]}${mention.reportStatus ? ` · 신고 상태: ${labels[mention.reportStatus] || mention.reportStatus}` : ""}</p>${(mention.reviewCandidates || []).map((candidate) => `<p>검토 후보 · ${escapeHtml(candidate.category)} · ${escapeHtml(candidate.term)}<br>${escapeHtml(candidate.excerpt)}</p>`).join("")}${mention.review?.quote ? `<p>담당자 기록 인용문: ${escapeHtml(mention.review.quote)}</p>` : ""}${mention.review?.context ? `<p>원문 맥락: ${escapeHtml(mention.review.context)}</p>` : ""}${mention.review?.checkedAt ? `<p>원문 확인: ${escapeHtml(mention.review.reviewer)} · ${escapeHtml(mention.review.checkedAt)}</p>` : ""}</td><td>${escapeHtml(mention.source)}</td><td>${labels[mention.sentiment]}</td><td>${labels[mention.status]}</td><td>${escapeHtml(mention.assignee)}</td></tr>`,
    )
    .join("");
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(state.settings.organization)} 평판 보고서</title><style>body{font-family:'Malgun Gothic',sans-serif;color:#293331;max-width:1100px;margin:40px auto;padding:0 20px}h1{font-size:28px}.meta,small{color:#849287;font-size:12px}.stats{display:flex;gap:50px;border-block:1px solid #ddd;padding:25px 0;margin:30px 0}.stats strong{display:block;font-size:32px;color:#087f73}.stats span{font-size:12px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:14px 10px;text-align:left;border-bottom:1px solid #ddd;vertical-align:top}th{background:#f3f6f4}a{color:#087f73;text-decoration:none}p{color:#748478;line-height:1.8;max-width:540px;overflow-wrap:anywhere}small{display:block;margin:6px 0}@media print{body{margin:0}tr{break-inside:avoid}}@media(max-width:600px){table{font-size:10px}td,th{padding:8px 4px}.stats{gap:20px}}</style><h1>${escapeHtml(state.settings.organization)} 평판 보고서</h1><p class="meta">생성 ${escapeHtml(new Date().toLocaleString("ko-KR"))} · 선택된 언급 ${mentions.length}건 · 체험 ${mentions.filter((mention) => mention.demo).length}건</p><div class="stats">${summary}<div><strong>${mentions.filter((mention) => mention.sentiment === "negative" && ["new", "reviewing"].includes(mention.status)).length}</strong><span>대응 대기</span></div></div><table><thead><tr><th>게시일</th><th>언급</th><th>출처</th><th>감정</th><th>상태</th><th>담당자</th></tr></thead><tbody>${rows}</tbody></table><p class="meta">공개 검색·RSS 기반 · 검토 후보는 제목·요약의 표현 일치 결과이며 위법 판정이 아닙니다. 인용문·맥락은 담당자 기록으로 원문 전체나 원본 증명 자료가 아닙니다.</p></html>`;
}

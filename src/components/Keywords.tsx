import { useState } from "react";
import type { FormEvent } from "react";
import {
  Check,
  CircleHelp,
  LoaderCircle,
  Pencil,
  Search,
  Trash2,
} from "lucide-react";
import type { AppState, Keyword, Mutation } from "../types";
import { splitWords } from "../api";
import { Empty, IconButton, Modal } from "./Shared";

export function Keywords({
  state,
  mutate,
  edit,
  remove,
  collect,
}: {
  state: AppState;
  mutate: Mutation;
  edit: (keyword: Keyword) => void;
  remove: (keyword: Keyword) => void;
  collect: (keyword: Keyword) => void;
}) {
  return (
    <>
      <div className="section-toolbar">
        <span className="subtle">
          등록 {state.keywords.length} / 30 · 활성{" "}
          {state.keywords.filter((keyword) => keyword.enabled).length}
        </span>
      </div>
      {state.keywords.length ? (
        <div className="keyword-list">
          {state.keywords.map((keyword) => (
            <article
              className={`keyword-item ${!keyword.enabled ? "disabled-item" : ""}`}
              key={keyword.id}
            >
              <div
                className="keyword-symbol"
                style={{
                  color: keyword.color,
                  backgroundColor: `${keyword.color}12`,
                }}
              >
                <Search size={22} />
              </div>
              <div className="keyword-info">
                <h2>{keyword.name}</h2>
                <div>
                  <span className="field-hint">부정어</span>
                  {(keyword.negativeWords || []).map((word) => (
                    <span className="mini-tag negative-word" key={word}>
                      {word}
                    </span>
                  ))}
                  {!keyword.negativeWords?.length && (
                    <span className="subtle">미등록</span>
                  )}
                </div>
                <div>
                  <span className="field-hint">별칭</span>
                  {keyword.aliases.length ? (
                    keyword.aliases.map((alias) => (
                      <span className="mini-tag" key={alias}>
                        {alias}
                      </span>
                    ))
                  ) : (
                    <span className="subtle">없음</span>
                  )}
                </div>
                <div>
                  <span className="field-hint">제외어</span>
                  {keyword.excludes.length ? (
                    keyword.excludes.map((word) => (
                      <span className="mini-tag excluded" key={word}>
                        {word}
                      </span>
                    ))
                  ) : (
                    <span className="subtle">없음</span>
                  )}
                </div>
              </div>
              <div className="keyword-count">
                <strong>
                  {
                    state.mentions.filter((mention) =>
                      mention.keywordIds.includes(keyword.id),
                    ).length
                  }
                </strong>
                <small>수집된 언급</small>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  aria-label={`${keyword.name} 수집 활성화`}
                  checked={keyword.enabled}
                  onChange={() =>
                    void mutate(`/keywords/${keyword.id}`, "PUT", {
                      ...keyword,
                      enabled: !keyword.enabled,
                    })
                  }
                />
                <span />
              </label>
              <IconButton
                label={`${keyword.name} 검색 수집`}
                disabled={!keyword.enabled || !keyword.negativeWords?.length}
                onClick={() => collect(keyword)}
              >
                <Search size={17} />
              </IconButton>
              <IconButton
                label={`${keyword.name} 수정`}
                onClick={() => edit(keyword)}
              >
                <Pencil size={17} />
              </IconButton>
              <IconButton
                label={`${keyword.name} 삭제`}
                onClick={() => remove(keyword)}
              >
                <Trash2 size={17} />
              </IconButton>
            </article>
          ))}
        </div>
      ) : (
        <Empty icon={Search} title="등록된 검색 키워드가 없습니다" />
      )}
      <div className="inline-note">
        <CircleHelp size={17} />
        <span>
          검색 조건: 대상 이름 또는 별칭 + 부정 키워드 · 제외어 포함 결과 제외
        </span>
      </div>
    </>
  );
}
export function KeywordEditor({
  keyword,
  close,
  mutate,
  initialNegativeWords,
}: {
  keyword: Keyword | "new";
  close: () => void;
  mutate: Mutation;
  initialNegativeWords: string[];
}) {
  const editing = keyword !== "new";
  const [name, setName] = useState(editing ? keyword.name : "");
  const [aliases, setAliases] = useState(
    editing ? keyword.aliases.join(", ") : "",
  );
  const [excludes, setExcludes] = useState(
    editing ? keyword.excludes.join(", ") : "",
  );
  const [color, setColor] = useState(editing ? keyword.color : "#087f73");
  const [negativeWords, setNegativeWords] = useState(
    (editing
      ? keyword.negativeWords || initialNegativeWords
      : initialNegativeWords
    ).join(", "),
  );
  const [enabled, setEnabled] = useState(editing ? keyword.enabled : true);
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    if (
      await mutate(
        editing ? `/keywords/${keyword.id}` : "/keywords",
        editing ? "PUT" : "POST",
        {
          name,
          aliases: splitWords(aliases),
          excludes: splitWords(excludes),
          negativeWords: splitWords(negativeWords),
          color,
          enabled,
        },
        editing ? "키워드를 수정했습니다." : "키워드를 등록했습니다.",
      )
    )
      close();
    setSaving(false);
  };
  return (
    <Modal
      title={editing ? "검색 키워드 수정" : "검색 키워드 추가"}
      close={close}
    >
      <form onSubmit={submit} className="form">
        <label>
          키워드 이름
          <input
            autoFocus
            required
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="브랜드명, 제품명"
          />
        </label>
        <label>
          별칭
          <textarea
            rows={2}
            value={aliases}
            onChange={(event) => setAliases(event.target.value)}
            placeholder="영문명, 줄임말 (쉼표로 구분)"
          />
        </label>
        <label>
          제외어
          <textarea
            rows={2}
            value={excludes}
            onChange={(event) => setExcludes(event.target.value)}
            placeholder="채용, 중고 (쉼표로 구분)"
          />
        </label>
        <label>
          부정 키워드 (최대 10개)
          <textarea
            rows={3}
            value={negativeWords}
            onChange={(event) => setNegativeWords(event.target.value)}
            placeholder="불만, 환불, 비방, 개인정보 유출"
            maxLength={1009}
            required
          />
        </label>
        <div className="form-inline">
          <label>
            표시 색상
            <input
              type="color"
              aria-label="키워드 색상"
              value={color}
              onChange={(event) => setColor(event.target.value)}
            />
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
            />
            수집 활성화
          </label>
        </div>
        <div className="modal-actions">
          <button type="button" onClick={close}>
            취소
          </button>
          <button className="primary" disabled={saving}>
            {saving ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <Check size={16} />
            )}
            저장
          </button>
        </div>
      </form>
    </Modal>
  );
}

import { fetch } from "undici";

export function aiStatus(environment = process.env) {
  return {
    configured: Boolean(environment.OPENAI_API_KEY),
    model: environment.OPENAI_MODEL || "gpt-4o-mini",
  };
}

export async function generateReportDraft(
  prompt,
  { environment = process.env, client = fetch, signal } = {},
) {
  if (!environment.OPENAI_API_KEY)
    throw Object.assign(
      new Error(
        "AI 키(OPENAI_API_KEY)가 설정되지 않았습니다. 프롬프트 복사를 이용하세요.",
      ),
      { status: 400 },
    );
  const response = await client("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    signal: signal || AbortSignal.timeout(60000),
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${environment.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: environment.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content:
            "당신은 한국 온라인 게시물 신고·삭제요청 원고를 작성하는 보조자입니다. 제공된 사실만 사용하고 허위 사실이나 확인되지 않은 법적 결론을 만들지 마세요.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!response.ok)
    throw Object.assign(new Error(`AI 응답 오류 (HTTP ${response.status})`), {
      status: 502,
    });
  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text)
    throw Object.assign(new Error("AI 응답이 비어 있습니다."), { status: 502 });
  return String(text).slice(0, 50000);
}

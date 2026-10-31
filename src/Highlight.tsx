export function Highlight({ text, words }: { text: string; words: string[] }) {
  const terms = [...new Set(words.map((word) => word.trim()).filter(Boolean))]
    .sort((first, second) => second.length - first.length)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!terms.length) return <>{text}</>;
  return (
    <>
      {text
        .split(new RegExp(`(${terms.join("|")})`, "gi"))
        .map((part, index) =>
          index % 2 ? (
            <mark className="negative-hit" key={index}>
              {part}
            </mark>
          ) : (
            part
          ),
        )}
    </>
  );
}

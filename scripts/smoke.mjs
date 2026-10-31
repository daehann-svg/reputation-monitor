import { newsUrl, readFeed } from "../server/collector.mjs";
const feed = await readFeed(newsUrl({ name: "삼성전자", aliases: [] }));
console.log(
  JSON.stringify(
    {
      feed: feed.title,
      items: feed.items.length,
      sampleTitles: feed.items.slice(0, 3).map((item) => item.title),
    },
    null,
    2,
  ),
);

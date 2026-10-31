import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, relative } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const IGNORE_NAMES = new Set([
  ".git",
  "node_modules",
  "dist",
  "dist-ssr",
  "data",
  ".test-data",
  "test-results",
  "playwright-report",
  ".env",
  ".DS_Store",
]);

function collectFiles(rootDir, currentDir = rootDir) {
  const results = [];
  for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
    if (IGNORE_NAMES.has(entry.name)) continue;
    if (entry.name.startsWith(".env") && entry.name !== ".env.example") continue;
    if (entry.name.endsWith(".log") || entry.name.endsWith(".sqlite")) continue;
    const fullPath = join(currentDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(rootDir, fullPath));
    } else if (entry.isFile()) {
      const size = statSync(fullPath).size;
      if (size <= 5 * 1024 * 1024) {
        results.push({
          path: relative(rootDir, fullPath).replaceAll("\\", "/"),
          fullPath,
        });
      }
    }
  }
  return results;
}

async function ghRequest(token, path, method = "GET", body) {
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "ReputationMonitor-Publisher/1.0",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text };
  }
  return { ok: response.ok, status: response.status, data };
}

async function main() {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    let clipToken = "";
    try {
      const clip = execSync("powershell.exe -NoProfile -Command Get-Clipboard", {
        encoding: "utf8",
      }).trim();
      if (/^(gh[pousr]_|github_pat_)[A-Za-z0-9_]+$/.test(clip)) {
        clipToken = clip;
        console.log("클립보드에서 GitHub 토큰을 자동으로 감지했습니다.");
      }
    } catch {}
    const token = (
      process.env.GITHUB_TOKEN ||
      clipToken ||
      (await rl.question("1. GitHub 토큰(ghp_... 또는 github_pat_...)을 입력 후 Enter: "))
    ).trim();
    if (!token) {
      console.error("오류: 토큰이 입력되지 않았습니다.");
      process.exit(1);
    }

    const repoName = (process.env.GITHUB_REPO || "reputation-monitor").trim();

    console.log("\n[1/5] GitHub 계정 확인 중...");
    const userRes = await ghRequest(token, "/user");
    if (!userRes.ok) {
      console.error(
        `오류: GitHub 인증 실패 (${userRes.status}) - ${userRes.data?.message || "토큰을 확인하세요."}`,
      );
      process.exit(1);
    }
    const owner = userRes.data.login;
    console.log(` -> 로그인 계정: ${owner}`);

    console.log(`[2/5] 저장소 (${owner}/${repoName}) 확인 및 생성 중...`);
    let repoRes = await ghRequest(token, `/repos/${owner}/${repoName}`);
    let initializedNow = false;
    if (repoRes.status === 404) {
      const createRes = await ghRequest(token, "/user/repos", "POST", {
        name: repoName,
        description: "온라인 평판 모니터 및 신고원고 관리 워크스페이스",
        private: false,
        auto_init: true,
      });
      if (!createRes.ok) {
        console.error(
          `오류: 저장소 생성 실패 (${createRes.status}) - ${createRes.data?.message || ""}`,
        );
        process.exit(1);
      }
      repoRes = createRes;
      initializedNow = true;
      console.log(` -> 신규 공개 저장소 생성 완료: ${repoRes.data.html_url}`);
      await new Promise((r) => setTimeout(r, 2500));
    } else if (!repoRes.ok) {
      console.error(`오류: 저장소 조회 실패 (${repoRes.status})`);
      process.exit(1);
    } else {
      console.log(` -> 기존 저장소 사용: ${repoRes.data.html_url}`);
    }

    const branch = repoRes.data.default_branch || "main";
    let refRes = await ghRequest(
      token,
      `/repos/${owner}/${repoName}/git/ref/heads/${branch}`,
    );
    if (refRes.status === 404 || refRes.status === 409) {
      console.log(" -> 빈 저장소 초기 커밋 생성 중...");
      const initFile = await ghRequest(
        token,
        `/repos/${owner}/${repoName}/contents/README.md`,
        "PUT",
        {
          message: "Initial commit",
          content: Buffer.from("# 평판 모니터\n", "utf8").toString("base64"),
          branch,
        },
      );
      if (!initFile.ok) {
        console.error(
          `오류: 초기 파일 생성 실패 (${initFile.status}) - ${initFile.data?.message || ""}`,
        );
        process.exit(1);
      }
      await new Promise((r) => setTimeout(r, 1500));
      refRes = await ghRequest(
        token,
        `/repos/${owner}/${repoName}/git/ref/heads/${branch}`,
      );
    }
    if (!refRes.ok) {
      console.error(
        `오류: 브랜치 참조 조회 실패 (${refRes.status}) - ${refRes.data?.message || ""}`,
      );
      process.exit(1);
    }
    const baseCommitSha = refRes.data.object.sha;

    const files = collectFiles(process.cwd());
    console.log(`[3/5] 프로젝트 파일 ${files.length}개 업로드 중...`);
    const treeItems = [];
    for (const file of files) {
      const content = readFileSync(file.fullPath).toString("base64");
      const blobRes = await ghRequest(
        token,
        `/repos/${owner}/${repoName}/git/blobs`,
        "POST",
        {
          content,
          encoding: "base64",
        },
      );
      if (!blobRes.ok) {
        console.error(
          `오류: 파일 업로드 실패 (${file.path}, ${blobRes.status}) - ${blobRes.data?.message || ""}`,
        );
        process.exit(1);
      }
      treeItems.push({
        path: file.path,
        mode: "100644",
        type: "blob",
        sha: blobRes.data.sha,
      });
    }

    console.log("[4/5] 커밋 생성 및 브랜치 반영 중...");
    const treeRes = await ghRequest(
      token,
      `/repos/${owner}/${repoName}/git/trees`,
      "POST",
      {
        tree: treeItems,
      },
    );
    if (!treeRes.ok) {
      console.error(`오류: 트리 생성 실패 (${treeRes.status})`);
      process.exit(1);
    }

    const commitRes = await ghRequest(
      token,
      `/repos/${owner}/${repoName}/git/commits`,
      "POST",
      {
        message: "Deploy Reputation Monitor web & mobile workspace",
        tree: treeRes.data.sha,
        parents: [baseCommitSha],
      },
    );
    if (!commitRes.ok) {
      console.error(`오류: 커밋 생성 실패 (${commitRes.status})`);
      process.exit(1);
    }

    const updateRef = await ghRequest(
      token,
      `/repos/${owner}/${repoName}/git/refs/heads/${branch}`,
      "PATCH",
      {
        sha: commitRes.data.sha,
        force: true,
      },
    );
    if (!updateRef.ok) {
      console.error(`오류: 브랜치 업데이트 실패 (${updateRef.status})`);
      process.exit(1);
    }

    console.log("[5/5] GitHub Pages(GitHub Actions 모드) 활성화 중...");
    const pagesGet = await ghRequest(token, `/repos/${owner}/${repoName}/pages`);
    if (pagesGet.status === 404) {
      await ghRequest(token, `/repos/${owner}/${repoName}/pages`, "POST", {
        build_type: "workflow",
        source: { branch, path: "/" },
      });
    } else if (pagesGet.ok) {
      await ghRequest(token, `/repos/${owner}/${repoName}/pages`, "PUT", {
        build_type: "workflow",
        source: { branch, path: "/" },
      });
    }

    await ghRequest(
      token,
      `/repos/${owner}/${repoName}/actions/workflows/pages.yml/dispatches`,
      "POST",
      { ref: branch },
    );

    const pagesUrl = `https://${owner}.github.io/${repoName}/`;
    try {
      writeFileSync(
        ".test-data/github-published.json",
        JSON.stringify(
          {
            owner,
            repoName,
            repoUrl: `https://github.com/${owner}/${repoName}`,
            pagesUrl,
          },
          null,
          2,
        ),
        "utf8",
      );
    } catch {}
    console.log("\n========================================");
    console.log("업로드 및 GitHub Pages 설정 완료!");
    console.log(`- GitHub 저장소: https://github.com/${owner}/${repoName}`);
    console.log(`- 웹·모바일 접속 주소 (약 1~2분 후 반영): ${pagesUrl}`);
    console.log("========================================");
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error("예기치 않은 오류:", err.message);
  process.exit(1);
});

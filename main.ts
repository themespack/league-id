// league-info.ts
// League Info - Hybrid Mode with season=latest support

import { Agent } from "npm:undici";

const keepAliveAgent = new Agent({ keepAliveTimeout: 10_000, keepAliveMaxTimeout: 15_000 });

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const leagueId = url.searchParams.get("leagueId") ?? "";
  let seasonId = url.searchParams.get("seasonId") ?? "";
  const seasonParam = url.searchParams.get("season") ?? ""; // bisa "latest"
  let tabs = (url.searchParams.get("tabs") ?? "overview,standings").split(",");

  // Expand "all" → semua tab
  if (tabs.includes("all")) {
    tabs = ["overview", "standings", "topScorers", "statistics", "matches", "transfers"];
  }

  if (!leagueId) {
    return jsonResponse({ success: false, error: "League ID is required" }, 400);
  }
  if (!/^[a-zA-Z0-9]+$/.test(leagueId)) {
    return jsonResponse({ success: false, error: "Invalid League ID format" }, 400);
  }

  const defaultPayload = {
    lang: "en",
    timeZone: "+07:00",
    platform: "web",
    agentType: null,
    appVersion: null,
    sign: null,
  };

  async function callApi(apiUrl: string, postData: Record<string, unknown>, timeout = 8000) {
    try {
      const ctrl = new AbortController();
      const id = setTimeout(() => ctrl.abort(), timeout);

      const resp = await fetch(apiUrl, {
        method: "POST",
        body: JSON.stringify(postData),
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0 (Deno)",
          "Accept": "application/json",
        },
        signal: ctrl.signal,
        // @ts-ignore
        dispatcher: keepAliveAgent,
      });

      clearTimeout(id);
      return await resp.json().catch(() => null);
    } catch {
      return null;
    }
  }

  const start = performance.now();
  let headerData: any = null;
  let availableSeasons: any[] = [];

  // Ambil header kalau:
  // 1. seasonId kosong, atau
  // 2. season=latest, atau
  // 3. tab overview diminta
  if (!seasonId || seasonParam === "latest" || tabs.includes("overview")) {
    headerData = await callApi(
      "https://api.igscore.net:8080/v1/football/competition/detail/header",
      { ...defaultPayload, competitionId: leagueId, includeMvp: false },
    );
    availableSeasons = headerData?.result?.seasons ?? [];

    if ((seasonParam === "latest" || !seasonId) && availableSeasons.length > 0) {
      seasonId = availableSeasons[0].id ?? "";
    }
  }

  const data: Record<string, any> = {};

  // Overview
  if (tabs.includes("overview")) {
    data.overview = { header: headerData };
  }

  // Standings
  if (tabs.includes("standings") && seasonId) {
    data.standings = await callApi(
      "https://api.igscore.net:8080/v1/football/competition/detail/standings",
      { ...defaultPayload, competitionId: leagueId, seasonId },
    );
  }

  // Top Scorers
  if (tabs.includes("topScorers") && seasonId) {
    data.topScorers = await callApi(
      "https://api.igscore.net:8080/v1/football/competition/detail/topScorers",
      { ...defaultPayload, competitionId: leagueId, seasonId, orderBy: 0, pageNum: 0, pageSize: 20 },
    );
  }

  // Statistics
  if (tabs.includes("statistics") && seasonId) {
    const [playerStats, teamStats] = await Promise.all([
      callApi("https://api.igscore.net:8080/v1/football/competition/detail/statistics/player", {
        ...defaultPayload,
        competitionId: leagueId,
        seasonId,
      }),
      callApi("https://api.igscore.net:8080/v1/football/competition/detail/statistics/team", {
        ...defaultPayload,
        competitionId: leagueId,
        seasonId,
      }),
    ]);
    data.statistics = { playerStats, teamStats };
  }

  // Matches
  if (tabs.includes("matches") && seasonId) {
    data.matches = await callApi(
      "https://api.igscore.net:8080/v1/football/competition/detail/matches",
      { ...defaultPayload, competitionId: leagueId, seasonId, pageNum: 0, pageSize: 20 },
    );
  }

  // Transfers
  if (tabs.includes("transfers")) {
    data.transfers = await callApi(
      "https://api.igscore.net:8080/v1/football/competition/detail/transfers",
      { ...defaultPayload, competitionId: leagueId, seasonId: "", teamId: "", year: new Date().getFullYear().toString() },
    );
  }

  const executionTime = ((performance.now() - start) / 1000).toFixed(2);

  return jsonResponse({
    success: true,
    executionTime,
    timestamp: new Date().toISOString(),
    metadata: { leagueId, seasonId, availableSeasons, tabs },
    data,
  });
});

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

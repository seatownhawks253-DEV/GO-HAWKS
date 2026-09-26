/**
 * NFL league directory and ESPN scoreboard/standings parsers.
 * Divisions follow the league's AFC/NFC alignment. Team colors are used
 * only as card accents.
 */
(function (global) {
  const ROWS = [
    ["ARI", "Cardinals", "Arizona Cardinals", "#97233F"],
    ["ATL", "Falcons", "Atlanta Falcons", "#C8102E"],
    ["BAL", "Ravens", "Baltimore Ravens", "#6d63d8"],
    ["BUF", "Bills", "Buffalo Bills", "#3d8bfd"],
    ["CAR", "Panthers", "Carolina Panthers", "#0085CA"],
    ["CHI", "Bears", "Chicago Bears", "#e25b2a"],
    ["CIN", "Bengals", "Cincinnati Bengals", "#FB4F14"],
    ["CLE", "Browns", "Cleveland Browns", "#ff4d1c"],
    ["DAL", "Cowboys", "Dallas Cowboys", "#4d8dff"],
    ["DEN", "Broncos", "Denver Broncos", "#FB4F14"],
    ["DET", "Lions", "Detroit Lions", "#0076B6"],
    ["GB", "Packers", "Green Bay Packers", "#FFB612"],
    ["HOU", "Texans", "Houston Texans", "#C8102E"],
    ["IND", "Colts", "Indianapolis Colts", "#3d6db5"],
    ["JAX", "Jaguars", "Jacksonville Jaguars", "#00b3a4"],
    ["KC", "Chiefs", "Kansas City Chiefs", "#E31837"],
    ["LV", "Raiders", "Las Vegas Raiders", "#c8c8c8"],
    ["LAC", "Chargers", "Los Angeles Chargers", "#0080C6"],
    ["LAR", "Rams", "Los Angeles Rams", "#ffd100"],
    ["MIA", "Dolphins", "Miami Dolphins", "#008E97"],
    ["MIN", "Vikings", "Minnesota Vikings", "#8a5cc4"],
    ["NE", "Patriots", "New England Patriots", "#c60c30"],
    ["NO", "Saints", "New Orleans Saints", "#d3bc8d"],
    ["NYG", "Giants", "New York Giants", "#6a7dff"],
    ["NYJ", "Jets", "New York Jets", "#2f9e62"],
    ["PHI", "Eagles", "Philadelphia Eagles", "#149898"],
    ["PIT", "Steelers", "Pittsburgh Steelers", "#FFB612"],
    ["SF", "49ers", "San Francisco 49ers", "#E31837"],
    ["SEA", "Seahawks", "Seattle Seahawks", "#69BE28"],
    ["TB", "Buccaneers", "Tampa Bay Buccaneers", "#E03A3E"],
    ["TEN", "Titans", "Tennessee Titans", "#4b92db"],
    ["WSH", "Commanders", "Washington Commanders", "#9b2743"],
  ];

  const TEAMS = {};
  ROWS.forEach((row) => {
    TEAMS[row[0]] = { abbr: row[0], short: row[1], name: row[2], color: row[3] };
  });

  const DIVISIONS = [
    { conference: "AFC", name: "AFC East", teams: ["BUF", "MIA", "NE", "NYJ"] },
    { conference: "AFC", name: "AFC North", teams: ["BAL", "CIN", "CLE", "PIT"] },
    { conference: "AFC", name: "AFC South", teams: ["HOU", "IND", "JAX", "TEN"] },
    { conference: "AFC", name: "AFC West", teams: ["DEN", "KC", "LV", "LAC"] },
    { conference: "NFC", name: "NFC East", teams: ["DAL", "NYG", "PHI", "WSH"] },
    { conference: "NFC", name: "NFC North", teams: ["CHI", "DET", "GB", "MIN"] },
    { conference: "NFC", name: "NFC South", teams: ["ATL", "CAR", "NO", "TB"] },
    { conference: "NFC", name: "NFC West", teams: ["ARI", "LAR", "SF", "SEA"] },
  ];

  function norm(abbr) {
    const key = String(abbr || "").toUpperCase();
    if (key === "WAS") return "WSH";
    return key;
  }

  function team(abbr) {
    const key = norm(abbr);
    return TEAMS[key] || { abbr: key || "NFL", short: key || "Team", name: key || "Team", color: "#8b939a" };
  }

  function logo(abbr) {
    return Season.helmetUrl(norm(abbr));
  }

  function formatRecord(wins, losses, ties) {
    const record = `${wins}-${losses}`;
    return ties ? `${record}-${ties}` : record;
  }

  function readStat(stats, name) {
    return (stats || []).find((stat) => stat.name === name) || null;
  }

  function parseStandings(payload) {
    const records = {};
    ((payload && payload.children) || []).forEach((conference) => {
      const entries = conference.standings && conference.standings.entries;
      (entries || []).forEach((entry) => {
        const abbr = norm(entry.team && entry.team.abbreviation);
        const stats = entry.stats || [];
        const wins = Number(readStat(stats, "wins") && readStat(stats, "wins").value) || 0;
        const losses = Number(readStat(stats, "losses") && readStat(stats, "losses").value) || 0;
        const ties = Number(readStat(stats, "ties") && readStat(stats, "ties").value) || 0;
        const diffStat = readStat(stats, "pointDifferential");
        const overall = readStat(stats, "overall");
        records[abbr] = {
          wins,
          losses,
          ties,
          diff: diffStat ? Number(diffStat.value) || 0 : 0,
          summary: overall && overall.displayValue ? overall.displayValue : formatRecord(wins, losses, ties),
        };
      });
    });
    return records;
  }

  function sideFromCompetitor(comp) {
    const abbr = norm(comp.team && comp.team.abbreviation);
    const total = (comp.records || []).find((record) => record.type === "total" || record.name === "overall");
    return {
      abbr,
      record: total && total.summary ? total.summary : "",
      score: comp.score,
    };
  }

  function parseScoreboard(payload) {
    const week = payload && payload.week ? payload.week.number : null;
    const games = ((payload && payload.events) || [])
      .map((event) => {
        const competition = event.competitions && event.competitions[0];
        if (!competition) return null;
        const statusNode = competition.status || event.status || {};
        const statusType = statusNode.type || {};
        let status = "pre";
        if (statusType.state === "in") status = "in";
        else if (statusType.state === "post" || statusType.completed) status = "post";
        const kickoffMs = Date.parse(event.date);
        if (!Number.isFinite(kickoffMs)) return null;
        let home = null;
        let away = null;
        (competition.competitors || []).forEach((comp) => {
          const side = sideFromCompetitor(comp);
          if (comp.homeAway === "home") home = side;
          else away = side;
        });
        if (!home || !away) return null;
        const venue = competition.venue || {};
        return {
          id: event.id,
          week,
          kickoffMs,
          status,
          clock: statusNode.displayClock || "",
          period: statusNode.period || 0,
          venue: venue.fullName || venue.displayName || "",
          home,
          away,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.kickoffMs - b.kickoffMs);
    return { week, games };
  }

  function involves(game, abbr) {
    const key = norm(abbr);
    return game.home.abbr === key || game.away.abbr === key;
  }

  global.League = {
    DIVISIONS,
    TEAMS,
    norm,
    team,
    logo,
    formatRecord,
    parseStandings,
    parseScoreboard,
    involves,
  };
})(window);

(function () {
  const SEA = "SEA";
  const LAST_WEEK = 18;

  const els = {
    heroWeek: document.getElementById("hero-week"),
    weekChip: document.getElementById("week-chip"),
    prevWeek: document.getElementById("prev-week"),
    nextWeek: document.getElementById("next-week"),
    featured: document.getElementById("featured"),
    featuredTeams: document.getElementById("featured-teams"),
    featuredWhen: document.getElementById("featured-when"),
    featuredClock: document.getElementById("featured-clock"),
    weekBoard: document.getElementById("week-board"),
    liveBanner: document.getElementById("live-banner"),
    liveCount: document.getElementById("live-count"),
    standings: document.getElementById("standings-root"),
    teams: document.getElementById("teams-root"),
    schedule: document.getElementById("schedule-list"),
    scheduleTitle: document.getElementById("schedule-title"),
    scheduleMeta: document.getElementById("schedule-meta"),
    status: document.getElementById("data-status"),
    refresh: document.getElementById("refresh-button"),
    views: document.querySelectorAll("[data-view]"),
    panels: document.querySelectorAll("[data-panel]"),
    filters: document.querySelectorAll("[data-filter]"),
  };

  const state = {
    seasonYear: Season.currentNflSeasonYear(),
    currentWeek: 1,
    week: 1,
    cache: new Map(),
    records: {},
    games: [],
    nextGame: null,
    source: "Loading schedule…",
    filter: "all",
    view: "nfl",
    featuredKickoff: 0,
    liveCount: 0,
  };

  function setText(node, value) {
    if (node) node.textContent = value;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function logoImg(abbr, className) {
    const img = el("img", className);
    const info = League.team(abbr);
    img.src = League.logo(abbr);
    img.alt = info.name;
    if (League.norm(abbr) === SEA) {
      img.addEventListener("error", () => {
        img.src = "assets/seahawks-helmet.png";
      });
    }
    return img;
  }

  function scoreText(score) {
    if (score == null || score === "") return "0";
    if (typeof score === "number") return String(score);
    if (typeof score === "string") return score;
    if (typeof score === "object") return String(score.displayValue ?? score.value ?? "0");
    return "0";
  }

  function periodLabel(period) {
    if (period > 4) return "OT";
    return ["", "1st", "2nd", "3rd", "4th"][period] || "";
  }

  function liveDetail(game) {
    const parts = [periodLabel(game.period)];
    if (game.clock && game.clock !== "0:00") parts.push(game.clock);
    return parts.filter(Boolean).join(" · ");
  }

  function recordFor(abbr, fallback) {
    const saved = state.records[League.norm(abbr)];
    if (saved && saved.summary) return saved.summary;
    return fallback || "—";
  }

  function whenLine(ms) {
    const date = Season.formatShortDate(ms).toUpperCase();
    return `${Season.formatGameDay(ms)} · ${date} · ${Season.formatKickoff(ms)}`;
  }

  function signature(games) {
    return games
      .map((game) => [game.id, game.status, scoreText(game.away.score), scoreText(game.home.score), game.clock].join(":"))
      .join("|");
  }

  async function fetchJson(url) {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`Could not load ${url}`);
    return response.json();
  }

  async function fetchWeek(week) {
    if (state.cache.has(week)) return state.cache.get(week);
    const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${state.seasonYear}&seasontype=2&week=${week}`;
    const parsed = League.parseScoreboard(await fetchJson(url));
    state.cache.set(week, parsed.games);
    return parsed.games;
  }

  async function loadSeason() {
    const schedule = await fetchJson(`data/schedules/${state.seasonYear}.json`);
    try {
      const payload = await fetchJson(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/26/schedule?season=${state.seasonYear}`);
      state.games = Season.gamesFromEspn(payload);
      state.source = "Live NFL schedule";
    } catch (error) {
      state.games = Season.gamesFromSchedule(schedule);
      state.source = "Saved Seahawks schedule · league feed unavailable";
    }
    state.nextGame = Season.findNextGame(state.games);
  }

  function seattleGame(games) {
    return (games || []).find((game) => League.involves(game, SEA)) || null;
  }

  function outlookFor(abbr) {
    const weeks = [state.currentWeek, state.currentWeek + 1].filter((week) => week >= 1 && week <= LAST_WEEK);
    const games = weeks.flatMap((week) => state.cache.get(week) || []);
    const mine = games
      .filter((game) => League.involves(game, abbr))
      .sort((a, b) => a.kickoffMs - b.kickoffMs);
    return mine.find((game) => game.status !== "post") || mine[mine.length - 1] || null;
  }

  function renderWeekControls() {
    setText(els.heroWeek, `Week ${state.week}`);
    setText(els.weekChip, `Week ${state.week}`);
    els.prevWeek.disabled = state.week <= 1;
    els.nextWeek.disabled = state.week >= LAST_WEEK;
  }

  function renderLiveBanner() {
    const games = state.cache.get(state.currentWeek) || [];
    const live = games.filter((game) => game.status === "in");
    state.liveCount = live.length;
    els.liveBanner.hidden = live.length === 0;
    if (live.length) {
      setText(els.liveCount, live.length === 1 ? "1 game on the field" : `${live.length} games on the field`);
    }
  }

  function squad(side, place) {
    const info = League.team(side.abbr);
    const wrap = el("div", "squad");
    wrap.append(logoImg(side.abbr));
    wrap.append(el("h3", "", info.short));
    wrap.append(el("p", "abbr", info.abbr));
    wrap.append(el("p", "record", recordFor(side.abbr, side.record)));
    wrap.append(el("span", "place-chip", place));
    return wrap;
  }

  function countdownBoard(kickoffMs) {
    const board = el("div", "scoreboard");
    const caption = el("p", "", "Kickoff in");
    caption.id = "countdown-caption";
    board.append(caption);
    [
      ["days", "Days"],
      ["hours", "Hrs"],
      ["minutes", "Min"],
      ["seconds", "Sec"],
    ].forEach(([unit, label]) => {
      const well = el("div", "well");
      const strong = el("strong", "", "00");
      strong.dataset.kickoff = String(kickoffMs);
      strong.dataset.unit = unit;
      if (unit === "days") strong.id = "count-days";
      well.append(strong, el("span", "", label));
      board.append(well);
    });
    return board;
  }

  function resultBoard(game) {
    const board = el("div", "result-board");
    const chip = el("span", `result-chip ${game.status === "in" ? "live" : "final"}`, game.status === "in" ? "Live" : "Final");
    const scores = el("div", "score-stack");
    scores.append(el("div", "", `${game.away.abbr} ${scoreText(game.away.score)}`));
    scores.append(el("div", "", `${game.home.abbr} ${scoreText(game.home.score)}`));
    board.append(chip, scores);
    if (game.status === "in") board.append(el("p", "clock-detail", liveDetail(game)));
    return board;
  }

  function renderFeatured() {
    const games = state.cache.get(state.week) || [];
    const game = seattleGame(games);
    els.featured.classList.toggle("is-seattle", true);
    els.featuredTeams.replaceChildren();
    els.featuredClock.replaceChildren();
    state.featuredKickoff = 0;

    if (!game) {
      const upcoming = state.nextGame;
      setText(els.featuredWhen, `Bye week · no Seattle game in week ${state.week}`);
      if (!upcoming) {
        els.featuredTeams.append(el("p", "empty", "Seattle's next kickoff is not on the schedule yet."));
        return;
      }
      const opponent = {
        abbr: League.norm(upcoming.opponentAbbr),
        record: recordFor(upcoming.opponentAbbr),
      };
      const seattle = { abbr: SEA, record: recordFor(SEA) };
      els.featuredTeams.append(
        squad(seattle, upcoming.isHome ? "Home" : "Away"),
        el("div", "versus", upcoming.isHome ? "VS" : "@"),
        squad(opponent, upcoming.isHome ? "Away" : "Home")
      );
      setText(els.featuredWhen, `Next kickoff · ${whenLine(upcoming.kickoffMs)}`);
      state.featuredKickoff = upcoming.kickoffMs;
      els.featuredClock.append(countdownBoard(upcoming.kickoffMs));
      return;
    }

    const seattleSide = game.home.abbr === SEA ? game.home : game.away;
    const otherSide = game.home.abbr === SEA ? game.away : game.home;
    const seattleHome = game.home.abbr === SEA;
    els.featuredTeams.append(
      squad(seattleSide, seattleHome ? "Home" : "Away"),
      el("div", "versus", "VS"),
      squad(otherSide, seattleHome ? "Away" : "Home")
    );
    const venue = game.venue ? ` · ${game.venue}` : "";
    setText(els.featuredWhen, `${whenLine(game.kickoffMs)}${venue}`);
    if (game.status === "pre") {
      state.featuredKickoff = game.kickoffMs;
      els.featuredClock.append(countdownBoard(game.kickoffMs));
    } else {
      els.featuredClock.append(resultBoard(game));
    }
  }

  function matchCard(game) {
    const card = el("article", "game-card");
    card.style.setProperty("--away", League.team(game.away.abbr).color);
    card.style.setProperty("--home", League.team(game.home.abbr).color);
    if (League.involves(game, SEA)) card.classList.add("is-seattle");
    if (game.status === "in") card.classList.add("is-live");

    card.append(el("p", "card-when", whenLine(game.kickoffMs)));

    const match = el("div", "card-match");
    [game.away, game.home].forEach((side, index) => {
      const column = el("div");
      column.append(logoImg(side.abbr));
      column.append(el("strong", "", side.abbr));
      column.append(el("span", "mini-label", index === 0 ? "Away" : "Home"));
      const detail = game.status === "pre" ? recordFor(side.abbr, side.record) : scoreText(side.score);
      column.append(el("span", "card-rec", detail));
      match.append(column);
      if (index === 0) match.append(el("div", "versus", "VS"));
    });
    card.append(match);

    if (game.status !== "pre") {
      const status = el("div", "card-status");
      status.append(el("span", `result-chip ${game.status === "in" ? "live" : "final"}`, game.status === "in" ? "Live" : "Final"));
      if (game.status === "in") status.append(el("p", "clock-detail", liveDetail(game)));
      card.append(status);
    }
    return card;
  }

  function renderWeekBoard(animate) {
    const games = state.cache.get(state.week) || [];
    els.weekBoard.replaceChildren();
    if (!games.length) {
      els.weekBoard.append(el("p", "empty", "No games published for this week."));
      return;
    }
    games.forEach((game) => els.weekBoard.append(matchCard(game)));
    if (animate) restartMotion(els.weekBoard);
  }

  function ranked(abbrs) {
    return abbrs
      .map((abbr) => ({ abbr, record: state.records[abbr] || { wins: 0, losses: 0, ties: 0, diff: 0, summary: "—" } }))
      .sort((a, b) => b.record.wins - a.record.wins || a.record.losses - b.record.losses || b.record.diff - a.record.diff);
  }

  function nextLabel(abbr) {
    const game = outlookFor(abbr);
    if (!game) return "Bye";
    const home = game.home.abbr === League.norm(abbr);
    const other = home ? game.away.abbr : game.home.abbr;
    const mark = home ? "vs" : "@";
    if (game.status === "in") return `Live ${mark} ${other}`;
    if (game.status === "post") return `Final ${mark} ${other}`;
    return `${mark} ${other}`;
  }

  function renderStandings() {
    els.standings.replaceChildren();
    ["AFC", "NFC"].forEach((conference) => {
      const label = el("div", "conference-label");
      label.append(el("h2", conference.toLowerCase(), conference));
      const grid = el("div", "division-grid");
      League.DIVISIONS.filter((division) => division.conference === conference).forEach((division) => {
        const panel = el("section", "division");
        panel.append(el("h3", "", division.name));
        ranked(division.teams).forEach((row, index) => {
          const line = el("div", "stand-row");
          line.style.setProperty("--team", League.team(row.abbr).color);
          if (row.abbr === SEA) line.classList.add("is-seattle");
          line.append(el("span", "pos", String(index + 1)));
          line.append(logoImg(row.abbr));
          const name = el("div");
          name.append(el("span", "stand-abbr", row.abbr));
          name.append(el("span", "stand-next", nextLabel(row.abbr)));
          line.append(name);
          line.append(el("span", "stand-rec", row.record.summary || "—"));
          panel.append(line);
        });
        grid.append(panel);
      });
      els.standings.append(label, grid);
    });
  }

  function renderTeams() {
    els.teams.replaceChildren();
    ["AFC", "NFC"].forEach((conference) => {
      const label = el("div", "conference-label");
      label.append(el("h2", conference.toLowerCase(), conference));
      els.teams.append(label);
      League.DIVISIONS.filter((division) => division.conference === conference).forEach((division) => {
        els.teams.append(el("h3", "division-name", division.name));
        const grid = el("div", "team-grid");
        division.teams.forEach((abbr) => {
          const info = League.team(abbr);
          const card = el("article", "team-card");
          card.style.setProperty("--team", info.color);
          if (abbr === SEA) card.classList.add("is-seattle");
          card.append(logoImg(abbr));
          card.append(el("h3", "", info.short));
          card.append(el("p", "record", recordFor(abbr)));
          const game = outlookFor(abbr);
          card.append(el("p", "next", game ? nextLabel(abbr) : "Bye"));
          if (game && game.status === "pre") {
            card.append(el("p", "when", whenLine(game.kickoffMs)));
            const count = el("p", "mini-count", "");
            count.dataset.kickoff = String(game.kickoffMs);
            count.dataset.unit = "all";
            card.append(count);
          } else if (game && game.status === "in") {
            card.append(el("p", "mini-count", "Live"));
          } else if (game) {
            card.append(el("p", "when", "Final"));
          }
          grid.append(card);
        });
        els.teams.append(grid);
      });
    });
  }

  function renderSchedule() {
    const record = Season.recordFromGames(state.games);
    const recordText = record.ties ? `${record.wins}-${record.losses}-${record.ties}` : `${record.wins}-${record.losses}`;
    setText(els.scheduleTitle, `${state.seasonYear}–${state.seasonYear + 1} Seahawks schedule`);
    setText(els.scheduleMeta, `Seattle ${recordText} · ${record.played} of ${record.total || 17} played`);
    const games = state.games.filter((game) => {
      if (state.filter === "upcoming") return !game.isPast;
      if (state.filter === "final") return game.isPast;
      return true;
    });
    els.schedule.replaceChildren();
    if (!games.length) {
      els.schedule.append(el("p", "empty", "No games in this view."));
      return;
    }
    games.forEach((game) => {
      const row = el("article", "game-row");
      if (game.week === state.week) row.classList.add("is-week");
      if (game.isNext) row.classList.add("is-next");
      if (game.isPast) row.classList.add("is-past");
      const week = el("div", "week-badge");
      week.append(el("span", "", "Wk"), el("strong", "", String(game.week)));
      const details = el("div");
      details.append(el("p", "game-name", `${game.isHome ? "vs" : "@"} ${game.opponent}`));
      details.append(el("p", "game-meta", `${Season.formatWeekdayShort(game.kickoffMs)} · ${Season.formatShortDate(game.kickoffMs)} · ${Season.formatKickoff(game.kickoffMs)} · ${game.venue}`));
      const status = el("div", "game-status");
      if (game.result) {
        status.textContent = game.result;
        status.classList.add(game.isWin ? "win" : game.isTie ? "tie" : "loss");
      } else if (game.isNext) {
        status.textContent = "Next";
        status.classList.add("next");
      } else {
        status.textContent = Season.formatKickoff(game.kickoffMs);
      }
      row.append(week, logoImg(game.opponentAbbr, "row-logo"), details, status);
      els.schedule.append(row);
    });
  }

  function renderAll(animate) {
    renderWeekControls();
    renderLiveBanner();
    renderFeatured();
    renderWeekBoard(false);
    if (animate) {
      restartMotion(els.featured);
      restartMotion(els.weekBoard);
    }
    renderStandings();
    renderTeams();
    renderSchedule();
    tick();
    setText(els.status, state.source);
  }

  function tick() {
    const caption = document.getElementById("countdown-caption");
    document.querySelectorAll("[data-kickoff]").forEach((node) => {
      const countdown = Season.computeCountdown(Number(node.dataset.kickoff));
      if (node.dataset.unit === "all") {
        node.textContent = countdown.isGameTime ? "Kickoff" : `${countdown.days}d ${countdown.hours}:${countdown.minutes}:${countdown.seconds}`;
        return;
      }
      node.textContent = countdown[node.dataset.unit] || "00";
      if (caption && countdown.isGameTime) caption.textContent = "Kickoff";
    });
  }

  function restartMotion(node) {
    node.classList.remove("is-entering");
    void node.offsetWidth;
    node.classList.add("is-entering");
  }

  function showView(name) {
    state.view = name;
    els.panels.forEach((panel) => {
      const on = panel.dataset.panel === name;
      panel.hidden = !on;
      if (on) restartMotion(panel);
    });
    els.views.forEach((button) => {
      const on = button.dataset.view === name;
      button.classList.toggle("is-selected", on);
      button.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  async function showWeek(week, animate) {
    state.week = week;
    renderWeekControls();
    setText(els.status, `Loading week ${week}…`);
    try {
      await fetchWeek(week);
      if (week === state.currentWeek && state.currentWeek < LAST_WEEK && !state.cache.has(state.currentWeek + 1)) {
        fetchWeek(state.currentWeek + 1).catch(() => {});
      }
      renderAll(animate);
    } catch (error) {
      renderAll(false);
      setText(els.status, "That week could not be loaded. Seattle's saved schedule is still available.");
    }
  }

  async function refresh() {
    els.refresh.disabled = true;
    state.cache.clear();
    setText(els.status, "Refreshing the league schedule…");
    try {
      state.seasonYear = Season.currentNflSeasonYear();
      await loadSeason();
      try {
        const [board, standings] = await Promise.all([
          fetchJson("https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard"),
          fetchJson("https://site.api.espn.com/apis/v2/sports/football/nfl/standings").catch(() => null),
        ]);
        const parsed = League.parseScoreboard(board);
        state.currentWeek = parsed.week || state.nextGame && state.nextGame.week || 1;
        state.week = state.currentWeek;
        state.cache.set(state.currentWeek, parsed.games);
        if (standings) state.records = League.parseStandings(standings);
        if (state.currentWeek < LAST_WEEK) {
          await fetchWeek(state.currentWeek + 1).catch(() => {});
        }
      } catch (error) {
        state.week = state.nextGame ? state.nextGame.week : 1;
        state.currentWeek = state.week;
      }
      renderAll(true);
    } catch (error) {
      setText(els.status, "Schedule could not be loaded. Serve this folder over HTTP and try again.");
    } finally {
      els.refresh.disabled = false;
    }
  }

  els.views.forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.view));
  });
  els.prevWeek.addEventListener("click", () => {
    if (state.week > 1) showWeek(state.week - 1, true);
  });
  els.nextWeek.addEventListener("click", () => {
    if (state.week < LAST_WEEK) showWeek(state.week + 1, true);
  });
  els.liveBanner.addEventListener("click", () => {
    showView("nfl");
    if (state.week !== state.currentWeek) showWeek(state.currentWeek, true);
  });
  els.refresh.addEventListener("click", refresh);
  els.filters.forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter;
      els.filters.forEach((item) => {
        const selected = item === button;
        item.classList.toggle("is-selected", selected);
        item.setAttribute("aria-pressed", selected ? "true" : "false");
      });
      renderSchedule();
    });
  });

  window.setInterval(tick, 1000);
  window.setInterval(async () => {
    if (!state.currentWeek) return;
    try {
      const previousGames = state.cache.get(state.currentWeek) || [];
      const previous = signature(previousGames);
      state.cache.delete(state.currentWeek);
      try {
        await fetchWeek(state.currentWeek);
      } catch (error) {
        state.cache.set(state.currentWeek, previousGames);
        return;
      }
      const next = signature(state.cache.get(state.currentWeek) || []);
      renderLiveBanner();
      if (previous !== next && state.week === state.currentWeek) renderAll(false);
    } catch (error) {
      /* Keep the board that is already on screen. */
    }
  }, 45000);

  refresh();
})();

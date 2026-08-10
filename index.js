const KEY = "backplan_demo_v2";
let state = JSON.parse(localStorage.getItem(KEY) || "null") || {
  goals: [],
  settings: {
    limit: 20,
    sun: 0.7,
    calendarStart: new Date().toISOString().slice(0, 7),
    calendarMonths: 12,
    categories: [{ id: "default", name: "기본", color: "#5f8ff0" }],
    stampImage: "",
  },
  reschedules: 0,
};
state.settings.categories = state.settings.categories || [
  { id: "default", name: "기본", color: "#5f8ff0" },
];
// Move the built-in category with the app theme while leaving user-made
// category colors untouched.
const builtInCategory = state.settings.categories.find((c) => c.id === "default");
if (["#635bff", "#e981a5", "#8fb2fd"].includes(builtInCategory?.color))
  builtInCategory.color = "#5f8ff0";
state.goals.forEach((g) => {
  if (!g.rangeStart) {
    let first = (g.plan && g.plan[0]?.from) || 1;
    g.rangeStart = first;
    g.rangeEnd =
      g.plan && g.plan.length
        ? g.plan[g.plan.length - 1].to
        : first + g.total - 1;
  }
  if (!g.unitCustom) g.unitCustom = "";
});
state.settings.calendarStart =
  state.settings.calendarStart || new Date().toISOString().slice(0, 7);
state.settings.calendarMonths = Math.min(
  12,
  Math.max(1, state.settings.calendarMonths || 12),
);
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
function save() {
  localStorage.setItem(KEY, JSON.stringify(state));
  render();
}
function esc(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (m) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[m],
  );
}
function iso(d) {
  let x = new Date(d);
  return (
    x.getFullYear() +
    "-" +
    String(x.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(x.getDate()).padStart(2, "0")
  );
}
function parseDate(s) {
  return new Date(s + "T00:00:00");
}
function dates(a, b) {
  let out = [];
  for (let d = parseDate(a); d <= parseDate(b); d.setDate(d.getDate() + 1))
    out.push(new Date(d));
  return out;
}
function fmtDate(s) {
  return parseDate(s).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
}
function monthKey(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}
function addMonths(key, n) {
  let [y, m] = key.split("-").map(Number),
    d = new Date(y, m - 1 + n, 1);
  return monthKey(d);
}
function unitName(g) {
  return g.unit === "CUSTOM"
    ? g.unitCustom || "단위"
    : { PAGE: "페이지", LECTURE: "강", PROBLEM: "문제", CHAPTER: "단원" }[
        g.unit
      ] || g.unit;
}
function taskRange(t) {
  return t.from === t.to ? String(t.from) : `${t.from}~${t.to}`;
}
function category(g) {
  return (
    state.settings.categories.find((c) => c.id === g.categoryId) ||
    state.settings.categories[0]
  );
}
function alpha(hex, a) {
  let h = hex.replace("#", "");
  if (h.length === 3)
    h = h
      .split("")
      .map((x) => x + x)
      .join("");
  let r = parseInt(h.slice(0, 2), 16),
    gg = parseInt(h.slice(2, 4), 16),
    b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${gg},${b},${a})`;
}
function recurrenceLabel(g) {
  if (g.recurrence === "DAILY") return "매일";
  if (g.recurrence === "ALTERNATE") return "격일";
  if (g.recurrence === "WEEKLY")
    return (
      "매주 " + ["일", "월", "화", "수", "목", "금", "토"][g.weeklyDay] + "요일"
    );
  if (g.recurrence === "WEEKDAYS") return "평일";
  if (g.recurrence === "WEEKENDS") return "주말";
  return (
    (g.recurrenceDays || [])
      .map((x) => ["일", "월", "화", "수", "목", "금", "토"][x])
      .join(", ") + "요일"
  );
}
function eligible(d, g) {
  let wd = d.getDay();
  if (g.recurrence === "DAILY") return true;
  if (g.recurrence === "ALTERNATE") {
    return Math.floor((d - parseDate(g.start)) / 86400000) % 2 === 0;
  }
  if (g.recurrence === "WEEKLY") return wd === +g.weeklyDay;
  if (g.recurrence === "WEEKDAYS") return wd >= 1 && wd <= 5;
  if (g.recurrence === "WEEKENDS") return wd === 0 || wd === 6;
  return (g.recurrenceDays || []).includes(wd);
}
function makePlan(total, start, end, limit, sun, g, rangeStart) {
  let allDays = dates(start, end).filter((d) => eligible(d, g));
  if (!allDays.length)
    return { error: "선택한 주기로 가능한 계획일이 없습니다." };
  if (total <= 0) return [];

  // 목표 기간을 불필요하게 늘리지 않는다.
  // 사용할 수 있는 날짜 수보다 총량이 적으면 앞에서부터 하루 1단위씩 배치한다.
  // 총량이 더 많으면 먼저 모든 사용일에 가능한 한 균등하게 base를 배치하고,
  // 나머지 1단위들은 마지막 날짜들에 하나씩 분산한다.
  // 예: 11/10일 -> 1,1,1,1,1,1,1,1,1,2
  // 예: 22/10일 -> 2,2,2,2,2,2,2,3,3,3
  let neededDays = Math.min(allDays.length, total);
  let ds = allDays.slice(0, neededDays);
  let amounts = [];
  if (total <= ds.length) {
    amounts = Array(ds.length).fill(1);
  } else {
    let base = Math.floor(total / ds.length),
      remain = total % ds.length;
    amounts = Array(ds.length).fill(base);
    // 나머지는 한꺼번에 마지막 날에 몰지 않고 마지막 remain일에 1씩 추가한다.
    for (let i = ds.length - remain; i < ds.length; i++) amounts[i]++;
  }

  // 일요일 가중치 설정은 같은 총량을 배분할 때 참고하되, 사용 날짜 자체를
  // 목표 종료일까지 억지로 늘리는 용도로는 사용하지 않는다.
  let maxPerDay = Math.max(1, limit || 1);
  if (amounts.some((a) => a > maxPerDay))
    return {
      error: `하루 최대 ${maxPerDay}${unitName(g)}을 초과합니다. 기간을 늘리거나 하루 최대 분량을 높여주세요.`,
    };

  let cursor = Number(rangeStart || g.rangeStart || 1),
    out = [];
  ds.forEach((d, k) => {
    for (let j = 0; j < amounts[k]; j++) {
      let unit = cursor++;
      out.push({
        date: iso(d),
        amount: 1,
        from: unit,
        to: unit,
        status: "PLANNED",
        done: 0,
      });
    }
  });
  return out;
}
function goalInput() {
  let unit = $("#gUnit").value,
    rs = +$("#gRangeStart").value,
    re = +$("#gRangeEnd").value,
    total = +$("#gTotal").value;
  if (rs && re) {
    if (re < rs) {
      alert("범위 끝은 범위 시작보다 작을 수 없습니다.");
      return null;
    }
    total = re - rs + 1;
    $("#gTotal").value = total;
  }
  return {
    title: $("#gTitle").value.trim(),
    unit,
    total,
    rangeStart: rs || 1,
    rangeEnd: re || (rs || 1) + total - 1,
    start: $("#gStart").value,
    end: $("#gEnd").value,
    limit: +$("#gLimit").value,
    sun: +$("#gSun").value,
    categoryId: $("#gCategory").value,
    recurrence: $("#gRecurrence").value,
    weeklyDay: +$("#gWeeklyDay").value,
    recurrenceDays: $$("#recurrenceDays input:checked").map((x) => +x.value),
    unitCustom: $("#gCustomUnit").value.trim(),
  };
}
function buildPlanForInput(v, g, rangeStart) {
  return makePlan(
    v.total,
    v.start,
    v.end,
    v.limit,
    v.sun,
    g,
    rangeStart ?? v.rangeStart,
  );
}
function createGoal() {
  let v = goalInput();
  if (!v) return;
  if (!v.title || !v.total || !v.start || !v.end) {
    alert("목표 이름, 범위/총량, 기간을 입력해주세요.");
    return;
  }
  if (v.unit === "CUSTOM" && !v.unitCustom) {
    alert("직접 입력 단위명을 입력해주세요.");
    return;
  }
  if (new Date(v.start) > new Date(v.end)) {
    alert("시작일이 마감일보다 늦을 수 없습니다.");
    return;
  }
  if (v.recurrence === "CUSTOM_WEEKDAYS" && !v.recurrenceDays.length) {
    alert("요일을 하나 이상 선택해주세요.");
    return;
  }
  let g = {
    ...v,
    id: crypto.randomUUID(),
    plan: [],
    createdAt: new Date().toISOString(),
  };
  let p = buildPlanForInput(v, g);
  if (p.error) {
    alert(p.error);
    return;
  }
  g.plan = p;
  const plannedEnd = p.length ? p[p.length - 1].date : g.end;
  if (plannedEnd < g.end) g.end = plannedEnd;
  state.goals.push(g);
  save();
  closeGoal();
  showPage("goals");
}
function openEditGoal(id) {
  let g = state.goals.find((x) => x.id === id);
  if (!g) return;
  editingGoalId = id;
  populateCategories();
  $("#goalModalTitle").textContent = "계획 수정";
  $("#createGoal").textContent = "수정 저장";
  $("#gTitle").value = g.title;
  $("#gUnit").value = g.unit;
  $("#gCustomUnit").value = g.unitCustom || "";
  $("#gCustomUnit").disabled = g.unit !== "CUSTOM";
  $("#gRangeStart").value =
    g.rangeStart || g.plan.find((t) => t.from)?.from || 1;
  $("#gRangeEnd").value = g.rangeEnd || g.plan.slice(-1)[0]?.to || g.total;
  $("#gTotal").value = g.total;
  $("#gCategory").value = g.categoryId;
  $("#gStart").value = g.start;
  $("#gEnd").value = g.end;
  $("#gLimit").value = g.limit;
  $("#gSun").value = g.sun;
  $("#gRecurrence").value = g.recurrence;
  $("#gWeeklyDay").value = g.weeklyDay ?? 1;
  $$("#recurrenceDays input").forEach(
    (x) => (x.checked = (g.recurrenceDays || []).includes(+x.value)),
  );
  $("#weekdayField").style.display =
    g.recurrence === "CUSTOM_WEEKDAYS" ? "block" : "none";
  $("#weeklyField").style.display =
    g.recurrence === "WEEKLY" ? "block" : "none";
  $("#preview").style.display = "none";
  $("#goalModal").classList.add("open");
}
function saveEditedGoal() {
  let g = state.goals.find((x) => x.id === editingGoalId);
  if (!g) return;
  let v = goalInput();
  if (!v) return;
  if (!v.title || !v.total || !v.start || !v.end) {
    alert("목표 이름, 범위/총량, 기간을 입력해주세요.");
    return;
  }
  if (v.unit === "CUSTOM" && !v.unitCustom) {
    alert("직접 입력 단위명을 입력해주세요.");
    return;
  }
  if (new Date(v.start) > new Date(v.end)) {
    alert("시작일이 마감일보다 늦을 수 없습니다.");
    return;
  }
  if (v.recurrence === "CUSTOM_WEEKDAYS" && !v.recurrenceDays.length) {
    alert("요일을 하나 이상 선택해주세요.");
    return;
  }
  let today = iso(new Date()),
    oldPlan = g.plan || [],
    locked = oldPlan.filter((t) => t.date < today || t.done >= t.amount),
    unfinished = oldPlan.filter((t) => t.date >= today && t.done < t.amount),
    doneBefore = locked.reduce((a, t) => a + t.done, 0);
  if (v.total < doneBefore) {
    alert("이미 완료한 분량보다 새 총량을 작게 설정할 수 없습니다.");
    return;
  }
  let firstUnfinished = unfinished.sort((a, b) => a.from - b.from)[0];
  let rangeCursor = firstUnfinished
    ? firstUnfinished.from
    : v.rangeStart + doneBefore;
  let ng = { ...g, ...v };
  let futureStart = v.start > today ? v.start : today;
  if (new Date(futureStart) > new Date(v.end)) {
    alert("수정한 기간에 오늘 이후 계획을 배치할 수 없습니다.");
    return;
  }
  let remain = Math.max(0, v.total - doneBefore),
    future = [];
  if (remain) {
    let tmp = { ...ng, start: futureStart };
    let p = makePlan(
      remain,
      futureStart,
      v.end,
      v.limit,
      v.sun,
      tmp,
      rangeCursor,
    );
    if (p.error) {
      alert(p.error);
      return;
    }
    future = p.map((x) => ({ ...x, done: 0 }));
  }
  let lockedDates = new Set(locked.map((t) => t.date + "|" + t.from));
  future = future.filter((t) => !lockedDates.has(t.date + "|" + t.from));
  g = {
    ...ng,
    plan: [...locked, ...future].sort(
      (a, b) => a.date.localeCompare(b.date) || a.from - b.from,
    ),
  };
  const plannedEnd = g.plan.length ? g.plan[g.plan.length - 1].date : g.end;
  if (plannedEnd < g.end) g.end = plannedEnd;
  state.goals[state.goals.findIndex((x) => x.id === editingGoalId)] = g;
  editingGoalId = null;
  save();
  closeGoal();
}
function deleteGoal(id) {
  let g = state.goals.find((x) => x.id === id);
  if (!g) return;
  if (confirm(`'${g.title}' 계획을 삭제할까요?`)) {
    state.goals = state.goals.filter((x) => x.id !== id);
    save();
  }
}
function goalProgress(g) {
  return Math.min(
    100,
    Math.round((g.plan.reduce((s, x) => s + x.done, 0) / g.total) * 100),
  );
}
function taskAll() {
  return state.goals.flatMap((g) => g.plan.map((t) => ({ ...t, g })));
}
function render() {
  let now = new Date(),
    today = iso(now);
  $("#todayText").textContent = now.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
  let all = taskAll(),
    todayTasks = all.filter((t) => t.date === today),
    active = state.goals.filter((g) => goalProgress(g) < 100),
    total = state.goals.reduce((a, g) => a + g.total, 0),
    done = state.goals.reduce(
      (a, g) => a + g.plan.reduce((x, t) => x + t.done, 0),
      0,
    );
  $("#statGoals").textContent = active.length;
  $("#statTasks").textContent = todayTasks.length;
  $("#statRate").textContent = todayTasks.length
    ? Math.round(
        (todayTasks.filter((t) => t.done >= t.amount).length /
          todayTasks.length) *
          100,
      ) + "%"
    : "0%";
  $("#statProgress").textContent = total
    ? Math.round((done / total) * 100) + "%"
    : "0%";
  $("#taskDate").textContent = fmtDate(today);
  $("#goalList").innerHTML = state.goals.length
    ? state.goals.slice(0, 8).map(goalCard).join("")
    : '<div class="empty">아직 목표가 없습니다.<br>오른쪽 위에서 첫 목표를 만들어보세요.</div>';
  $("#allGoals").innerHTML = state.goals.length
    ? state.goals.map(goalRow).join("")
    : '<div class="empty">목표를 추가해보세요.</div>';
  $("#todayTasks").innerHTML = todayTasks.length
    ? todayTasks.map(taskHtml).join("")
    : '<div class="empty">오늘 예정된 일이 없습니다.</div>';
  $("#warning").innerHTML = state.goals
    .map((g) => {
      let past = g.plan.filter((t) => t.date < today),
        expected = past.reduce((a, t) => a + t.amount, 0),
        actual = past.reduce((a, t) => a + t.done, 0);
      return expected > actual + g.total * 0.08
        ? `<div class="warning">⚠ <b>${esc(g.title)}</b>이 현재 계획보다 ${expected - actual}${unitName(g)} 늦어지고 있습니다. <button class="secondary" onclick="reschedule('${g.id}')">자동 재계획</button></div>`
        : "";
    })
    .join("");
  renderCalendar();
  renderStats();
  renderSettings();
}
function goalCard(g) {
  let c = category(g);
  return `<div class="goal"><div class="goal-head"><div><div class="goal-title"><span class="dot" style="display:inline-block;background:${c.color};margin-right:6px"></span>${esc(g.title)}</div><div class="small">${g.rangeStart || g.total}~${g.rangeEnd || g.total}${esc(unitName(g))} · ${fmtDate(g.start)} ~ ${fmtDate(g.end)} · ${esc(recurrenceLabel(g))}</div></div><b>${goalProgress(g)}%</b></div><div class="bar"><i style="width:${goalProgress(g)}%;background:${c.color}"></i></div></div>`;
}
function goalRow(g) {
  let c = category(g);
  return `<div class="goal"><div class="goal-head"><div style="cursor:pointer" onclick="openStampBoard('${g.id}')"><div class="goal-title"><span class="dot" style="display:inline-block;background:${c.color};margin-right:6px"></span>${esc(g.title)}</div><div class="small">${g.rangeStart || g.total}~${g.rangeEnd || g.total}${esc(unitName(g))} · ${fmtDate(g.start)} ~ ${fmtDate(g.end)} · ${esc(recurrenceLabel(g))}</div></div><div><span class="pill">${goalProgress(g)}%</span> <button class="secondary" onclick="openEditGoal('${g.id}')">✎ 수정</button> <button class="secondary danger" onclick="deleteGoal('${g.id}')">삭제</button> <button class="secondary" onclick="reschedule('${g.id}')">↻ 재계획</button></div></div><div class="bar"><i style="width:${goalProgress(g)}%;background:${c.color}"></i></div><div class="small" style="margin-top:7px">목표를 클릭하면 계획 스탬프판을 엽니다.</div></div>`;
}
function taskHtml(t) {
  let done = t.done >= t.amount,
    c = category(t.g);
  return `<div class="task ${done ? "done" : ""}" onclick="toggleTask('${t.g.id}','${t.date}',${t.from})"><button class="check" type="button"></button><div class="txt"><b>${esc(t.g.title)}</b><div class="small"><span style="color:${c.color}">●</span> ${taskRange(t)}${esc(unitName(t.g))}</div></div><button class="secondary task-move" type="button" onclick="event.stopPropagation();openTaskMove('${t.g.id}','${t.date}',${t.from})">날짜 이동</button></div>`;
}
function toggleTask(gid, date, from) {
  let g = state.goals.find((x) => x.id === gid),
    t = g?.plan.find((x) => x.date === date && x.from === from);
  if (!t) return;
  t.done = t.done >= t.amount ? 0 : t.amount;
  save();
}
function renderCalendar() {
  let grid = $("#annualGrid"),
    start = state.settings.calendarStart,
    n = state.settings.calendarMonths,
    months = [...Array(n)].map((_, i) => addMonths(start, i));
  grid.style.gridTemplateColumns = `minmax(220px,1.2fr) repeat(${n},minmax(90px,1fr))`;
  grid.style.minWidth = 220 + n * 90 + "px";
  $("#annualRangeText").textContent =
    `${start.replace("-", "년 ")}월 ~ ${months[n - 1].replace("-", "년 ")}월`;
  let html =
    '<div class="cell head">계획</div>' +
    months
      .map(
        (m, i) =>
          `<div class="cell head month-head" data-month="${m}" data-col="${i}">${m.split("-")[1]}월</div>`,
      )
      .join("");
  if (!state.goals.length) {
    grid.innerHTML =
      html +
      '<div class="annual-empty">목표를 만들면 연간 캘린더가 생성됩니다.</div>';
    $("#annualLegend").innerHTML = "";
    return;
  }
  state.goals.forEach((g) => {
    let c = category(g);
    html += `<div class="cell"><div class="plan-name" title="${esc(g.title)}">${esc(g.title)}</div><div class="small">${fmtDate(g.start)}~${fmtDate(g.end)}</div></div>`;
    months.forEach((m) => {
      let daysInMonth = new Date(+m.slice(0, 4), +m.slice(5), 0).getDate(),
        ms = parseDate(m + "-01"),
        me = new Date(ms.getFullYear(), ms.getMonth(), daysInMonth),
        gs = parseDate(g.start),
        ge = parseDate(g.end),
        from = gs > ms ? gs : ms,
        to = ge < me ? ge : me;
      if (from <= to) {
        let startDay = from.getDate(),
          endDay = to.getDate(),
          left = ((startDay - 1) / daysInMonth) * 100,
          right = (endDay / daysInMonth) * 100;
        let tip = `${g.title} · ${fmtDate(iso(from))} ~ ${fmtDate(iso(to))} · ${g.rangeStart || g.total}~${g.rangeEnd || g.total}${unitName(g)} · ${recurrenceLabel(g)} · ${category(g).name}`;
        html += `<div class="cell"><div class="plan-bar" style="left:calc(${left}% + 5px);right:calc(${100 - right}% + 5px);background:${alpha(c.color, 0.3)}" title="${esc(tip)}"></div></div>`;
      } else html += '<div class="cell"></div>';
    });
  });
  grid.innerHTML = html;
  grid.querySelectorAll(".month-head").forEach((h) => {
    h.onmouseenter = () => highlightColumn(+h.dataset.col, true);
    h.onmouseleave = () => highlightColumn(+h.dataset.col, false);
    h.onclick = () => openMonth(h.dataset.month);
  });
  $("#annualLegend").innerHTML = state.settings.categories
    .map(
      (c) =>
        `<div class="legend-item"><span class="dot" style="background:${c.color}"></span>${esc(c.name)}</div>`,
    )
    .join("");
}
function highlightColumn(col, on) {
  let grid = $("#annualGrid"),
    n = state.settings.calendarMonths;
  [...grid.children].forEach((el, i) => {
    let colIndex = i % (n + 1);
    if (colIndex === col + 1) el.classList.toggle("month-col-hover", on);
  });
}
function openMonth(m) {
  $("#annualView").style.display = "none";
  $("#monthlyView").style.display = "block";
  $("#calendarTitle").textContent = "월간 캘린더";
  state._month = m;
  renderMonth();
}
function renderMonth() {
  let m = state._month || state.settings.calendarStart,
    [y, mo] = m.split("-").map(Number),
    first = new Date(y, mo - 1, 1),
    last = new Date(y, mo, 0),
    grid = $("#monthGrid");
  $("#monthTitle").textContent = `${y}년 ${mo}월`;
  let h = ["일", "월", "화", "수", "목", "금", "토"]
    .map((x) => `<div class="month-dow">${x}</div>`)
    .join("");
  let cells = [];
  for (let i = 0; i < first.getDay(); i++)
    cells.push('<div class="mday out"></div>');
  for (let d = 1; d <= last.getDate(); d++) {
    let date = iso(new Date(y, mo - 1, d)),
      ts = taskAll().filter((t) => t.date === date);
    cells.push(
      `<div class="mday" onclick="openDayDetail('${date}')"><div class="mdate">${d}일</div>${ts
        .slice(0, 4)
        .map((t) => {
          let c = category(t.g);
          return `<div class="mini-plan" style="background:${alpha(c.color, 0.18)};color:#111">${esc(t.g.title)} · ${taskRange(t)}${esc(unitName(t.g))}</div>`;
        })
        .join(
          "",
        )}${ts.length > 4 ? `<div class="small" style="margin-top:5px">+ ${ts.length - 4}개 더</div>` : ""}</div>`,
    );
  }
  grid.innerHTML = h + cells.join("");
}
function openDayDetail(date) {
  let ts = taskAll().filter((t) => t.date === date),
    modal = $("#detailModal");
  $("#detailTitle").textContent = fmtDate(date) + " 계획";
  $("#detailSub").textContent = ts.length
    ? `${ts.length}개의 계획`
    : "계획 없음";
  $("#detailList").innerHTML = ts.length
    ? ts
        .map((t) => {
          let c = category(t.g),
            done = t.done >= t.amount;
          return `<div class="detail-item"><input type="checkbox" ${done ? "checked" : ""} onchange="toggleTask('${t.g.id}','${t.date}',${t.from})"><div style="flex:1"><b>${esc(t.g.title)}</b><div class="small">${taskRange(t)}${esc(unitName(t.g))} · ${esc(recurrenceLabel(t.g))}</div><div class="small" style="color:${c.color}">● ${esc(c.name)}</div></div></div>`;
        })
        .join("")
    : '<div class="empty">이 날짜에는 계획이 없습니다.</div>';
  modal.classList.add("open");
}
function renderStats() {
  let total = state.goals.reduce((a, g) => a + g.total, 0),
    done = state.goals.reduce(
      (a, g) => a + g.plan.reduce((x, t) => x + t.done, 0),
      0,
    );
  $("#sPlan").textContent = total
    ? Math.round((done / total) * 100) + "%"
    : "0%";
  $("#sDone").textContent = done;
  $("#sRemain").textContent = Math.max(0, total - done);
  $("#sReschedule").textContent = state.reschedules;
  $("#statsTable").innerHTML = state.goals
    .map(
      (g) =>
        `<tr><td>${esc(g.title)}</td><td>${goalProgress(g)}%</td><td>${fmtDate(g.start)} ~ ${fmtDate(g.end)}</td><td>${esc(recurrenceLabel(g))}</td><td>${goalProgress(g) >= 100 ? "완료" : "진행 중"}</td></tr>`,
    )
    .join("");
}
function reschedule(id) {
  let g = state.goals.find((x) => x.id === id),
    today = iso(new Date());
  if (!g) return;
  let locked = g.plan.filter((t) => t.date < today || t.done >= t.amount),
    unfinished = g.plan.filter((t) => t.date >= today && t.done < t.amount),
    doneTotal = locked.reduce((a, t) => a + t.done, 0),
    remaining = g.total - doneTotal;
  if (!remaining) {
    alert("이미 완료된 목표입니다.");
    return;
  }
  if (new Date(today) > parseDate(g.end)) {
    alert("마감일이 지났습니다. 기간을 먼저 수정해주세요.");
    return;
  }
  let firstUnfinished = unfinished.sort((a, b) => a.from - b.from)[0],
    rangeCursor = firstUnfinished
      ? firstUnfinished.from
      : (g.rangeStart || 1) + doneTotal;
  let tmp = { ...g, start: today };
  let p = makePlan(remaining, today, g.end, g.limit, g.sun, tmp, rangeCursor);
  if (p.error) {
    alert(p.error);
    return;
  }
  let lockedKeys = new Set(locked.map((t) => t.date + "|" + t.from));
  p = p.filter((t) => !lockedKeys.has(t.date + "|" + t.from));
  g.plan = [...locked, ...p.map((x) => ({ ...x, done: 0 }))].sort(
    (a, b) => a.date.localeCompare(b.date) || a.from - b.from,
  );
  state.reschedules++;
  save();
  alert(
    "과거 일정과 이미 완료한 일정은 그대로 두고, 미완료 일정만 오늘 이후로 다시 배분했습니다.",
  );
}
function showPage(id) {
  $$(".page").forEach((p) => p.classList.toggle("active", p.id === id));
  $$(".nav button").forEach((b) =>
    b.classList.toggle("active", b.dataset.page === id),
  );
  if (id === "calendar") showAnnual();
  if (id === "settings") renderSettings();
  if (id === "goals") {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }
}
function showAnnual() {
  $("#annualView").style.display = "block";
  $("#monthlyView").style.display = "none";
  $("#calendarTitle").textContent = "연간 캘린더";
  renderCalendar();
}
let editingGoalId = null;
function openGoal() {
  editingGoalId = null;
  populateCategories();
  let today = iso(new Date());
  $("#goalModalTitle").textContent = "새 목표 만들기";
  $("#createGoal").textContent = "역산 계획 생성";
  $("#gTitle").value = "";
  $("#gStart").value = today;
  $("#gEnd").value = iso(new Date(Date.now() + 29 * 86400000));
  $("#gLimit").value = state.settings.limit;
  $("#gSun").value = state.settings.sun;
  $("#gUnit").value = "PAGE";
  $("#gCustomUnit").value = "";
  $("#gCustomUnit").disabled = true;
  $("#gRangeStart").value = "";
  $("#gRangeEnd").value = "";
  $("#gTotal").value = "";
  $("#gRecurrence").value = "DAILY";
  $("#weekdayField").style.display = "none";
  $("#weeklyField").style.display = "none";
  $$("#recurrenceDays input").forEach((x) => (x.checked = false));
  $("#preview").style.display = "none";
  $("#goalModal").classList.add("open");
}
function closeGoal() {
  $("#goalModal").classList.remove("open");
}
function populateCategories() {
  let s = $("#gCategory");
  s.innerHTML = state.settings.categories
    .map((c) => `<option value="${c.id}">${esc(c.name)}</option>`)
    .join("");
}
function renderSettings() {
  $("#defaultLimit").value = state.settings.limit;
  $("#sunWeight").value = state.settings.sun;
  $("#calStart").value = state.settings.calendarStart;
  $("#calMonths").value = state.settings.calendarMonths;
  $("#categoryList").innerHTML = state.settings.categories
    .map(
      (c, i) =>
        `<div class="category-row"><input value="${esc(c.name)}" oninput="updateCategoryName('${c.id}',this.value)"><input class="color-input" type="color" value="${c.color}" onchange="updateCategoryColor('${c.id}',this.value)">${state.settings.categories.length > 1 ? `<button class="secondary danger" onclick="deleteCategory('${c.id}')">삭제</button>` : '<span class="small">기본</span>'}</div>`,
    )
    .join("");
  let img = $("#stampPreview");
  if (state.settings.stampImage) {
    img.src = state.settings.stampImage;
    img.style.display = "block";
  } else img.style.display = "none";
}
function updateCategoryName(id, v) {
  let c = state.settings.categories.find((x) => x.id === id);
  if (c) c.name = v;
  localStorage.setItem(KEY, JSON.stringify(state));
}
function updateCategoryColor(id, v) {
  let c = state.settings.categories.find((x) => x.id === id);
  if (c) c.color = v;
  localStorage.setItem(KEY, JSON.stringify(state));
  render();
}
function deleteCategory(id) {
  if (state.goals.some((g) => g.categoryId === id)) {
    alert("이 카테고리를 사용하는 계획이 있어 삭제할 수 없습니다.");
    return;
  }
  state.settings.categories = state.settings.categories.filter(
    (c) => c.id !== id,
  );
  save();
}
function openStampBoard(id) {
  let g = state.goals.find((x) => x.id === id);
  if (!g) return;
  $("#stampTitle").textContent = g.title + " · 계획 스탬프판";
  $("#stampSub").textContent =
    `${fmtDate(g.start)} ~ ${fmtDate(g.end)} · ${g.rangeStart || g.total}~${g.rangeEnd || g.total}${unitName(g)} · ${recurrenceLabel(g)}`;
  $("#stampBoard").innerHTML = g.plan
    .map((t, i) => {
      let done = t.done >= t.amount,
        img = state.settings.stampImage;
      return `<div class="stamp-cell ${done ? "done" : ""}" onclick="stampCell('${g.id}','${t.date}',${t.from})" title="${fmtDate(t.date)} · ${taskRange(t)}${unitName(g)}">${img && done ? `<img class="stamp-img" src="${img}">` : ""}<span class="stamp-num">${taskRange(t)}</span>${!done ? `<span class="small">${fmtDate(t.date).slice(5)}</span>` : ""}</div>`;
    })
    .join("");
  $("#stampModal").classList.add("open");
}
function stampCell(gid, date, from) {
  toggleTask(gid, date, from);
  openStampBoard(gid);
}
// events
$("#newGoal").onclick = openGoal;
$("#newGoal2").onclick = openGoal;
$("#viewAllGoals").onclick = () => showPage("goals");
$("#closeGoal").onclick = closeGoal;
$("#createGoal").onclick = () =>
  editingGoalId ? saveEditedGoal() : createGoal();
$("#closeDetail").onclick = () => $("#detailModal").classList.remove("open");
$("#closeStamp").onclick = () => $("#stampModal").classList.remove("open");
$("#backAnnual").onclick = showAnnual;
$$(".nav button").forEach((b) => (b.onclick = () => showPage(b.dataset.page)));
$("#gUnit").onchange = () => {
  $("#gCustomUnit").disabled = $("#gUnit").value !== "CUSTOM";
  if ($("#gUnit").value !== "CUSTOM") $("#gCustomUnit").value = "";
  previewPlan();
};
$("#gRecurrence").onchange = () => {
  let v = $("#gRecurrence").value;
  $("#weekdayField").style.display = v === "CUSTOM_WEEKDAYS" ? "block" : "none";
  $("#weeklyField").style.display = v === "WEEKLY" ? "block" : "none";
  previewPlan();
};
[
  "gTotal",
  "gRangeStart",
  "gRangeEnd",
  "gStart",
  "gEnd",
  "gLimit",
  "gSun",
  "gRecurrence",
  "gWeeklyDay",
  "gCustomUnit",
].forEach((id) => $("#" + id).addEventListener("input", previewPlan));
$$("#recurrenceDays input").forEach((x) =>
  x.addEventListener("change", previewPlan),
);
function previewPlan() {
  let rs = +$("#gRangeStart").value,
    re = +$("#gRangeEnd").value,
    total = +$("#gTotal").value;
  if (rs && re) {
    if (re >= rs) {
      total = re - rs + 1;
      $("#gTotal").value = total;
    } else return;
  }
  if (!total || !$("#gStart").value || !$("#gEnd").value) return;
  let g = {
    unit: $("#gUnit").value,
    unitCustom: $("#gCustomUnit").value,
    recurrence: $("#gRecurrence").value,
    weeklyDay: +$("#gWeeklyDay").value,
    recurrenceDays: $$("#recurrenceDays input:checked").map((x) => +x.value),
    start: $("#gStart").value,
    rangeStart: rs || 1,
  };
  let p = makePlan(
      total,
      $("#gStart").value,
      $("#gEnd").value,
      +$("#gLimit").value,
      +$("#gSun").value,
      g,
      rs || 1,
    ),
    el = $("#preview");
  el.style.display = "block";
  if (p.error) {
    el.textContent = p.error;
    return;
  }
  let plannedEnd = p.length ? p[p.length - 1].date : $("#gStart").value;
  let target = $("#gEnd").value;
  let targetLater = target > plannedEnd;
  el.className = "warning";
  el.innerHTML = `가능한 계획일 <b>${p.length}일</b> · ${rs && re ? `${rs}~${re}${unitName(g)}` : `총 ${total}${unitName(g)}`} · 계획상 종료일 <b>${fmtDate(plannedEnd)}</b>${targetLater ? `<br>⚠ <b>주의:</b> 입력한 목표 종료일(${fmtDate(target)})보다 계획이 먼저 끝납니다. 저장 또는 수정 저장 시 목표 종료일은 계획 종료일인 <b>${fmtDate(plannedEnd)}</b>로 자동 변경됩니다.` : ""}`;
}
$("#prevMonth").onclick = () => {
  state._month = addMonths(state._month, -1);
  renderMonth();
};
$("#nextMonth").onclick = () => {
  state._month = addMonths(state._month, 1);
  renderMonth();
};
$("#editCalendarRange").onclick = () => {
  showPage("settings");
  setTimeout(() => $("#calStart").focus(), 0);
};
$("#saveSettings").onclick = () => {
  state.settings.limit = Math.max(1, +$("#defaultLimit").value || 20);
  state.settings.sun = Math.max(0, +$("#sunWeight").value || 0);
  save();
  alert("기본값을 저장했습니다.");
};
$("#saveCalRange").onclick = () => {
  let s = $("#calStart").value,
    n = Math.min(12, Math.max(1, +$("#calMonths").value || 12));
  if (!s) {
    alert("시작 월을 선택해주세요.");
    return;
  }
  state.settings.calendarStart = s;
  state.settings.calendarMonths = n;
  save();
  alert("캘린더 표시 범위를 저장했습니다.");
};
$("#addCategory").onclick = () => {
  state.settings.categories.push({
    id: crypto.randomUUID(),
    name: "새 카테고리",
    color: "#8b85ff",
  });
  save();
};
$("#stampUpload").onchange = (e) => {
  let f = e.target.files[0];
  if (!f) return;
  let r = new FileReader();
  r.onload = () => {
    state.settings.stampImage = r.result;
    save();
  };
  r.readAsDataURL(f);
};
$("#clearStamp").onclick = () => {
  state.settings.stampImage = "";
  save();
};
if (state.settings.dateFixV3 && !state.settings.dateFixV4) {
  state.goals.forEach((g) => {
    (g.plan || []).forEach((t) => {
      let d = parseDate(t.date);
      d.setDate(d.getDate() - 1);
      t.date = iso(d);
    });
  });
  state.settings.dateFixV4 = true;
  localStorage.setItem(KEY, JSON.stringify(state));
}
render();

/* v8 extensions */
(function () {
    const origSave = save;
    function ensureV8() {
      state.folders = state.folders || [];
      state.settings.calendarSelection = state.settings
        .calendarSelection || { plans: [], folders: [] };
      state.settings.calendarExpanded =
        state.settings.calendarExpanded || {};
      state.settings.goalFolderExpanded =
        state.settings.goalFolderExpanded || {};
      state.settings.goalSort = state.settings.goalSort || "created";
      state.settings.calendarSort =
        state.settings.calendarSort || "created";
      state.goals.forEach((g) => {
        if (!g.createdAt) g.createdAt = new Date(0).toISOString();
        if (g.folderId === undefined) g.folderId = null;
      });
    }
    ensureV8();
    function saveV8() {
      localStorage.setItem(KEY, JSON.stringify(state));
      render();
    }
    window.save = saveV8;
    function folderById(id) {
      return state.folders.find((f) => f.id === id);
    }
    function folderPlans(f) {
      if (!f) return [];
      let ids = new Set(f.planIds || []);
      return state.goals.filter(
        (g) => g.folderId === f.id || ids.has(g.id),
      );
    }
    function typeRank(x) {
      return x.kind === "curriculum" ? 0 : x.kind === "general" ? 1 : 2;
    }
    function dateVal(s) {
      return s ? parseDate(s).getTime() : Infinity;
    }
    function itemSort(a, b, criterion) {
      if (criterion === "created")
        return (
          new Date(a.createdAt || 0) - new Date(b.createdAt || 0) ||
          String(a.name || a.title).localeCompare(
            String(b.name || b.title),
            "ko",
          )
        );
      if (criterion === "type")
        return (
          typeRank(a) - typeRank(b) ||
          String(a.name || a.title).localeCompare(
            String(b.name || b.title),
            "ko",
          )
        );
      if (criterion === "name")
        return String(a.name || a.title).localeCompare(
          String(b.name || b.title),
          "ko",
        );
      if (criterion === "start")
        return (
          dateVal(a.startDate) - dateVal(b.startDate) ||
          String(a.name || a.title).localeCompare(
            String(b.name || b.title),
            "ko",
          )
        );
      if (criterion === "end")
        return (
          dateVal(a.endDate) - dateVal(b.endDate) ||
          String(a.name || a.title).localeCompare(
            String(b.name || b.title),
            "ko",
          )
        );
      return 0;
    }
    function folderSortProxy(f, criterion) {
      let ps = folderPlans(f),
        earliestStart = ps.length
          ? ps.reduce((m, g) => (g.start < m ? g.start : m), "9999-12-31")
          : null,
        earliestEnd = ps.length
          ? ps.reduce((m, g) => (g.end < m ? g.end : m), "9999-12-31")
          : null;
      return {
        id: f.id,
        kind: f.type,
        name: f.name,
        createdAt: f.createdAt,
        startDate: earliestStart,
        endDate: earliestEnd,
      };
    }
    function combinedItems(criterion) {
      let fs = state.folders.map((f) => folderSortProxy(f, criterion)),
        gs = state.goals.map((g) => ({
          kind: "plan",
          name: g.title,
          title: g.title,
          createdAt: g.createdAt,
          startDate: g.start,
          endDate: g.end,
          g,
        }));
      return [...fs, ...gs].sort((a, b) => itemSort(a, b, criterion));
    }
    function selectedGoals() {
      let ids = new Set(state.settings.calendarSelection.plans || []),
        folderIds = new Set(state.settings.calendarSelection.folders || []);
      state.folders
        .filter((f) => folderIds.has(f.id))
        .forEach((f) => f.planIds.forEach((id) => ids.add(id)));
      return state.goals.filter((g) => ids.has(g.id));
    }
    window.selectedGoals = selectedGoals;
    function folderNameFor(g) {
      let f = folderById(g.folderId);
      return f ? f.name : "";
    }
    function sortGoalList() {
      return [...state.goals].sort((a, b) =>
        itemSort(
          {
            kind: "plan",
            name: a.title,
            title: a.title,
            createdAt: a.createdAt,
            startDate: a.start,
            endDate: a.end,
          },
          {
            kind: "plan",
            name: b.title,
            title: b.title,
            createdAt: b.createdAt,
            startDate: b.start,
            endDate: b.end,
          },
          state.settings.goalSort,
        ),
      );
    }
    function renderGoalManagement() {
      ensureV8();
      let root = $("#allGoals");
      // 내 목표에서는 폴더가 하나의 최상위 목록 항목으로 표시되고,
      // 폴더에 들어간 계획은 폴더를 펼쳤을 때만 내부에서 표시한다.
      const folderIds = new Set(state.folders.map((f) => f.id));
      const folders = state.folders.map((f) =>
        folderSortProxy(f, state.settings.goalSort),
      );
      const standalone = state.goals
        .filter((g) => !g.folderId || !folderIds.has(g.folderId))
        .map((g) => ({
          kind: "plan",
          name: g.title,
          title: g.title,
          createdAt: g.createdAt,
          startDate: g.start,
          endDate: g.end,
          g,
        }));
      const items = [...folders, ...standalone].sort((a, b) =>
        itemSort(a, b, state.settings.goalSort),
      );
      if (!items.length) {
        root.innerHTML =
          '<div class="empty">목표나 폴더를 추가해보세요.</div>';
        return;
      }
      root.innerHTML = items
        .map((x) => (x.kind === "plan" ? goalRow(x.g) : folderGoalRow(x)))
        .join("");
    }
    window.goalRow = function (g) {
      let c = category(g),
        f = folderById(g.folderId);
      return `<div class="goal"><div class="goal-head"><div style="cursor:pointer" onclick="openStampBoard('${g.id}')"><div class="goal-title"><span class="dot" style="display:inline-block;background:${c.color};margin-right:6px"></span>${esc(g.title)}${f ? `<span class="folder-pill">📁 ${esc(f.name)}</span>` : ""}</div><div class="small">${g.rangeStart || g.total}~${g.rangeEnd || g.total}${esc(unitName(g))} · ${fmtDate(g.start)} ~ ${fmtDate(g.end)} · ${esc(recurrenceLabel(g))}</div></div><div><span class="pill">${goalProgress(g)}%</span> <button class="secondary" onclick="openEditGoal('${g.id}')">✎ 수정</button> <button class="secondary" onclick="cloneGoal('${g.id}')">⧉ 복제</button> <button class="secondary danger" onclick="deleteGoal('${g.id}')">삭제</button> <button class="secondary" onclick="reschedule('${g.id}')">↻ 재계획</button></div></div><div class="bar"><i style="width:${goalProgress(g)}%;background:${c.color}"></i></div></div>`;
    };
    function folderGoalRow(f) {
      const ps = folderPlans(f).sort((a, b) =>
        itemSort(
          {
            kind: "plan",
            name: a.title,
            title: a.title,
            createdAt: a.createdAt,
            startDate: a.start,
            endDate: a.end,
          },
          {
            kind: "plan",
            name: b.title,
            title: b.title,
            createdAt: b.createdAt,
            startDate: b.start,
            endDate: b.end,
          },
          state.settings.goalSort,
        ),
      );
      const open = state.settings.goalFolderExpanded[f.id] !== false;
      return `<div class="folder-row goal-folder-row">
  <div class="folder-head">
    <div style="display:flex;align-items:center;gap:5px">
      <button class="collapse-btn" onclick="toggleGoalFolder('${f.id}')" title="폴더 ${open ? "접기" : "펼치기"}">${open ? "▼" : "▶"}</button>
      <span class="folder-title">📁 ${esc(f.name)}</span>
      <span class="folder-type">${f.kind === "curriculum" ? "커리큘럼 폴더" : "일반 폴더"}</span>
      <span class="small"> · ${ps.length}개 계획</span>
    </div>
    <div>
      <button class="secondary" onclick="renameFolder('${f.id}')">✎ 이름</button>
      <button class="secondary danger" onclick="deleteFolder('${f.id}')">삭제</button>
    </div>
  </div>
  ${open ? `<div class="child-list">${ps.length ? ps.map((g) => goalRow(g)).join("") : '<div class="small">폴더가 비어 있습니다.</div>'}</div>` : ""}
</div>`;
    }
    function toggleGoalFolder(id) {
      state.settings.goalFolderExpanded[id] =
        state.settings.goalFolderExpanded[id] === false;
      saveV8();
    }
    window.toggleGoalFolder = toggleGoalFolder;
    function folderRow(f) {
      let ps = folderPlans(f).sort((a, b) =>
        itemSort(
          {
            kind: "plan",
            name: a.title,
            title: a.title,
            createdAt: a.createdAt,
            startDate: a.start,
            endDate: a.end,
          },
          {
            kind: "plan",
            name: b.title,
            title: b.title,
            createdAt: b.createdAt,
            startDate: b.start,
            endDate: b.end,
          },
          state.settings.goalSort,
        ),
      );
      return `<div class="folder-row"><div class="folder-head"><div><button class="collapse-btn" onclick="toggleFolder('${f.id}')">${state.settings.calendarExpanded[f.id] === false ? "▶" : "▼"}</button><span class="folder-title">📁 ${esc(f.name)}</span> <span class="folder-type">${f.type === "curriculum" ? "커리큘럼 폴더" : "일반 폴더"}</span><span class="small"> · ${ps.length}개 계획</span></div><div><button class="secondary" onclick="renameFolder('${f.id}')">✎ 이름</button> <button class="secondary danger" onclick="deleteFolder('${f.id}')">삭제</button></div></div>${state.settings.calendarExpanded[f.id] === false ? "" : `<div class="child-list">${ps.length ? ps.map((g) => goalRow(g)).join("") : '<div class="small">폴더가 비어 있습니다.</div>'}</div>`}</div>`;
    }
    function toggleFolder(id) {
      state.settings.calendarExpanded[id] =
        state.settings.calendarExpanded[id] === false;
      saveV8();
    }
    window.toggleFolder = toggleFolder;
    function newFolder(type) {
      let name = prompt(
        type === "curriculum"
          ? "커리큘럼 폴더 이름을 입력하세요."
          : "일반 폴더 이름을 입력하세요.",
        "새 폴더",
      );
      if (!name?.trim()) return;
      state.folders.push({
        id: crypto.randomUUID(),
        name: name.trim(),
        type,
        createdAt: new Date().toISOString(),
        planIds: [],
      });
      saveV8();
    }
    window.newFolder = newFolder;
    function folderModal(id, mode) {
      let f = folderById(id);
      if (!f) return;
      let modal = $("#folderEditModal");
      if (!modal) {
        modal = document.createElement("div");
        modal.id = "folderEditModal";
        modal.className = "modal-bg";
        modal.innerHTML = `<div class="modal" style="max-width:520px">
    <div class="section-title"><h2 id="folderEditTitle" style="margin:0"></h2><button class="secondary" id="folderEditClose">닫기</button></div>
    <div class="field"><label>폴더 이름</label><input id="folderEditName" type="text"></div>
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px"><button class="secondary" id="folderEditCancel">취소</button><button class="primary" id="folderEditSave">저장</button></div>
  </div>`;
        document.body.appendChild(modal);
        const close = () => modal.classList.remove("open");
        $("#folderEditClose").onclick = close;
        $("#folderEditCancel").onclick = close;
        $("#folderEditSave").onclick = () => {
          const name = $("#folderEditName").value.trim();
          if (!name) {
            alert("폴더 이름을 입력해주세요.");
            return;
          }
          const target = folderById(modal.dataset.folderId);
          if (!target) return;
          target.name = name;
          close();
          saveV8();
        };
        $("#folderEditName").onkeydown = (e) => {
          if (e.key === "Enter") $("#folderEditSave").click();
          if (e.key === "Escape") close();
        };
      }
      modal.dataset.folderId = id;
      $("#folderEditTitle").textContent =
        (f.type === "curriculum" ? "커리큘럼" : "일반") + " 폴더 수정";
      $("#folderEditName").value = f.name;
      modal.classList.add("open");
      setTimeout(() => $("#folderEditName").focus(), 20);
    }
    function renameFolder(id) {
      folderModal(id, "edit");
    }
    window.renameFolder = renameFolder;
    function deleteFolder(id) {
      const f = folderById(id);
      if (!f) return;
      if (
        !confirm(
          `'${f.name}' 폴더를 삭제할까요?\n폴더 안의 계획은 삭제되지 않습니다.`,
        )
      )
        return;
      // 계획은 보존하고 폴더 연결만 제거한다.
      state.goals.forEach((g) => {
        if (g.folderId === id) delete g.folderId;
      });
      // 다른 표현으로 저장된 폴더-계획 연결도 제거한다.
      state.folders.forEach((folder) => {
        if (Array.isArray(folder.planIds)) {
          folder.planIds = folder.planIds.filter(
            (pid) =>
              !state.goals.some((g) => g.id === pid && g.folderId === id),
          );
        }
      });
      state.settings.calendarSelection = state.settings
        .calendarSelection || { plans: [], folders: [] };
      state.settings.calendarSelection.folders = (
        state.settings.calendarSelection.folders || []
      ).filter((x) => x !== id);
      delete state.settings.goalFolderExpanded[id];
      delete state.settings.calendarExpanded[id];
      state.folders = state.folders.filter((x) => x.id !== id);
      saveV8();
    }
    window.deleteFolder = deleteFolder;
    function cloneGoal(id) {
      let g = state.goals.find((x) => x.id === id);
      if (!g) return;
      let ng = JSON.parse(JSON.stringify(g));
      ng.id = crypto.randomUUID();
      ng.title = g.title + " (복제)";
      ng.createdAt = new Date().toISOString();
      ng.plan = (g.plan || []).map((t) => ({ ...t, done: 0 }));
      state.goals.push(ng);
      saveV8();
    }
    window.cloneGoal = cloneGoal;
    function refreshFolderSelect() {
      let el = $("#gFolder");
      if (!el) return;
      el.innerHTML =
        '<option value="">폴더 없음</option>' +
        state.folders
          .map(
            (f) =>
              `<option value="${f.id}">${f.type === "curriculum" ? "[커리큘럼]" : "[일반]"} ${esc(f.name)}</option>`,
          )
          .join("");
    }
    const oldOpenGoal = window.openGoal,
      oldOpenEdit = window.openEditGoal;
    window.openGoal = function () {
      oldOpenGoal();
      refreshFolderSelect();
      $("#gFolder").value = "";
    };
    window.openEditGoal = function (id) {
      oldOpenEdit(id);
      refreshFolderSelect();
      let g = state.goals.find((x) => x.id === id);
      if (g) $("#gFolder").value = g.folderId || "";
    };
    const oldGoalInput = window.goalInput;
    window.goalInput = function () {
      let v = oldGoalInput();
      if (v) v.folderId = $("#gFolder")?.value || null;
      return v;
    };
    const oldCreate = window.createGoal;
    window.createGoal = function () {
      let before = state.goals.length;
      oldCreate();
      if (state.goals.length > before) {
        let g = state.goals[state.goals.length - 1];
        if (g.folderId) {
          let f = folderById(g.folderId);
          if (f && !f.planIds.includes(g.id)) f.planIds.push(g.id);
          saveV8();
        }
      }
    };
    const oldSaveEdit = window.saveEditedGoal;
    window.saveEditedGoal = function () {
      let id = editingGoalId,
        g = state.goals.find((x) => x.id === id),
        oldFolder = g?.folderId;
      oldSaveEdit();
      let ng = state.goals.find((x) => x.id === id);
      if (ng) {
        state.folders.forEach(
          (f) => (f.planIds = f.planIds.filter((x) => x !== id)),
        );
        if (ng.folderId) {
          let f = folderById(ng.folderId);
          if (f && !f.planIds.includes(id)) f.planIds.push(id);
        }
        saveV8();
      }
    };
    function calendarSelectionPanel() {
      let panel = $("#calendarSelectPanel");
      if (!panel) return;
      let sp = new Set(state.settings.calendarSelection.plans || []),
        sf = new Set(state.settings.calendarSelection.folders || []);
      panel.innerHTML = `<div class="select-group"><b>계획</b>${state.goals.length ? state.goals.map((g) => `<label class="select-item"><input type="checkbox" data-plan-select="${g.id}" ${sp.has(g.id) ? "checked" : ""}> <span>${esc(g.title)}</span></label>`).join("") : '<div class="small">계획이 없습니다.</div>'}</div><div class="select-group"><b>폴더</b>${state.folders.length ? state.folders.map((f) => `<label class="select-item folder"><input type="checkbox" data-folder-select="${f.id}" ${sf.has(f.id) ? "checked" : ""}> <span>📁 ${esc(f.name)}</span></label>`).join("") : '<div class="small">폴더가 없습니다.</div>'}</div>`;
      panel.querySelectorAll("[data-plan-select]").forEach(
        (x) =>
          (x.onchange = () => {
            let a = new Set(state.settings.calendarSelection.plans || []);
            x.checked
              ? a.add(x.dataset.planSelect)
              : a.delete(x.dataset.planSelect);
            state.settings.calendarSelection.plans = [...a];
            saveV8();
          }),
      );
      panel.querySelectorAll("[data-folder-select]").forEach(
        (x) =>
          (x.onchange = () => {
            let a = new Set(state.settings.calendarSelection.folders || []);
            x.checked
              ? a.add(x.dataset.folderSelect)
              : a.delete(x.dataset.folderSelect);
            state.settings.calendarSelection.folders = [...a];
            saveV8();
          }),
      );
    }
    window.renderCalendar = function () {
      ensureV8();
      let grid = $("#annualGrid"),
        start = state.settings.calendarStart,
        n = state.settings.calendarMonths,
        months = [...Array(n)].map((_, i) => addMonths(start, i));
      grid.style.gridTemplateColumns = `minmax(220px,1.2fr) repeat(${n},minmax(90px,1fr))`;
      grid.style.minWidth = 220 + n * 90 + "px";
      $("#annualRangeText").textContent =
        `${start.replace("-", "년 ")}월 ~ ${months[n - 1].replace("-", "년 ")}월`;
      let html =
        '<div class="cell head">계획 / 폴더</div>' +
        months
          .map(
            (m, i) =>
              `<div class="cell head month-head" data-month="${m}" data-col="${i}">${m.split("-")[1]}월</div>`,
          )
          .join("");
      let selected = selectedGoals(),
        selectedFolderIds = new Set(
          state.settings.calendarSelection.folders || [],
        ),
        explicitlySelectedPlanIds = new Set(
          state.settings.calendarSelection.plans || [],
        ),
        rows = [];
      // A plan included through a selected folder is represented by that folder
      // only.  Do not also add its standalone row when it happens to be selected.
      const plansInSelectedFolders = new Set();
      state.folders
        .filter((f) => selectedFolderIds.has(f.id))
        .forEach((f) =>
          folderPlans(f).forEach((g) => plansInSelectedFolders.add(g.id)),
        );
      // Render selected folders first, then selected plans outside those folders.
      // Building these two groups separately prevents a selected folder from
      // swallowing later individually-selected plans during mixed sorting.
      const selectedFolders = state.folders
        .filter((f) => selectedFolderIds.has(f.id))
        .sort((a, b) =>
          itemSort(
            folderSortProxy(a, state.settings.calendarSort),
            folderSortProxy(b, state.settings.calendarSort),
            state.settings.calendarSort,
          ),
        );
      selectedFolders.forEach((f) => {
          rows.push({ type: "folder", f });
          let children = folderPlans(f).filter((g) =>
            selected.some((s) => s.id === g.id),
          );
          if (state.settings.calendarExpanded[f.id] !== false) {
            if (f.type === "curriculum") {
              // group by category and place non-overlapping plans into compact lanes
              let by = {};
              children.forEach((g) => (by[g.categoryId] ??= []).push(g));
              Object.values(by).forEach((gs) => {
                gs.sort((a, b) => a.start.localeCompare(b.start));
                let lanes = [];
                gs.forEach((g) => {
                  let lane = lanes.find(
                    (l) => l[l.length - 1].end < g.start,
                  );
                  if (lane) lane.push(g);
                  else lanes.push([g]);
                });
                lanes.forEach((lane, i) =>
                  rows.push({
                    type: "curriculumLane",
                    f,
                    gs: lane,
                    label:
                      category(lane[0]).name +
                      (lanes.length > 1 ? " " + (i + 1) : ""),
                  }),
                );
              });
            } else
              children.forEach((g) =>
                rows.push({ type: "plan", g, child: true }),
              );
          }
      });
      selected
        // A checked child plan is deliberately shown once more as its own row.
        // Folder-only selection still keeps child plans combined.
        .filter(
          (g) =>
            !plansInSelectedFolders.has(g.id) ||
            explicitlySelectedPlanIds.has(g.id),
        )
        .sort((a, b) =>
          itemSort(
            { kind: "plan", name: a.title, title: a.title, createdAt: a.createdAt, startDate: a.start, endDate: a.end },
            { kind: "plan", name: b.title, title: b.title, createdAt: b.createdAt, startDate: b.start, endDate: b.end },
            state.settings.calendarSort,
          ),
        )
        .forEach((g) => rows.push({ type: "plan", g }));
      if (!rows.length) {
        grid.innerHTML =
          html +
          '<div class="annual-empty">표시할 계획이나 폴더를 선택해주세요.</div>';
        $("#annualLegend").innerHTML = "";
        return;
      }
      rows.forEach((r) => {
        let label =
          r.type === "folder"
            ? `<button class="collapse-btn" onclick="toggleFolder('${r.f.id}')">${state.settings.calendarExpanded[r.f.id] === false ? "▶" : "▼"}</button><span class="folder-icon ${r.f.type === "curriculum" ? "curriculum" : "general"}">${"📁"}</span> ${esc(r.f.name)}`
            : r.type === "curriculumLane"
              ? `↳ ${esc(r.label)}`
              : esc(r.g.title);
        html += `<div class="cell"><div class="plan-name">${label}</div>${r.type === "plan" && r.child ? '<div class="small">' + esc(folderNameFor(r.g)) + "</div>" : ""}</div>`;
        months.forEach((m) => {
          let daysInMonth = new Date(
              +m.slice(0, 4),
              +m.slice(5),
              0,
            ).getDate(),
            ms = parseDate(m + "-01"),
            me = new Date(ms.getFullYear(), ms.getMonth(), daysInMonth);
          let gs =
              r.type === "folder"
                ? null
                : parseDate(
                    r.type === "curriculumLane" ? r.gs[0].start : r.g.start,
                  ),
            ge =
              r.type === "folder"
                ? null
                : parseDate(
                    r.type === "curriculumLane"
                      ? r.gs[r.gs.length - 1].end
                      : r.g.end,
                  );
          if (r.type === "folder") {
            html += '<div class="cell"></div>';
            return;
          }
          if (r.type === "curriculumLane") {
            const bars = r.gs
              .map((g) => {
                const goalStart = parseDate(g.start);
                const goalEnd = parseDate(g.end);
                const startMonth = monthKey(goalStart);
                const endMonth = monthKey(goalEnd);
                const firstVisibleMonth = months.find(
                  (month) => month >= startMonth && month <= endMonth,
                );
                const lastVisibleMonth = [...months]
                  .reverse()
                  .find((month) => month >= startMonth && month <= endMonth);
                // Render one bar from its first visible month across all later
                // month cells.  It deliberately sits above the grid lines.
                if (m !== firstVisibleMonth || !lastVisibleMonth) return "";
                const firstIndex = months.indexOf(firstVisibleMonth);
                const lastIndex = months.indexOf(lastVisibleMonth);
                const firstMonthDate = parseDate(firstVisibleMonth + "-01");
                const lastMonthDate = parseDate(lastVisibleMonth + "-01");
                const firstMonthDays = new Date(
                  firstMonthDate.getFullYear(),
                  firstMonthDate.getMonth() + 1,
                  0,
                ).getDate();
                const lastMonthDays = new Date(
                  lastMonthDate.getFullYear(),
                  lastMonthDate.getMonth() + 1,
                  0,
                ).getDate();
                const barFrom = goalStart > firstMonthDate ? goalStart : firstMonthDate;
                const lastMonthEnd = new Date(
                  lastMonthDate.getFullYear(),
                  lastMonthDate.getMonth(),
                  lastMonthDays,
                );
                const barTo = goalEnd < lastMonthEnd ? goalEnd : lastMonthEnd;
                const left = ((barFrom.getDate() - 1) / firstMonthDays) * 100;
                const right = (barTo.getDate() / lastMonthDays) * 100;
                const width = (lastIndex - firstIndex) * 100 + right - left;
                const tip = `${g.title} · ${fmtDate(g.start)} ~ ${fmtDate(g.end)} · ${g.rangeStart || g.total}~${g.rangeEnd || g.total}${unitName(g)} · ${recurrenceLabel(g)} · ${category(g).name}`;
                return `<div class="plan-bar curriculum-plan-bar" style="left:calc(${left}% + 5px);width:max(8px, calc(${width}% - 10px));background:${alpha(category(g).color, 0.3)}" title="${esc(tip)}" onclick="event.stopPropagation();openPlanBarInfo('${g.id}')"><span class="plan-bar-label">${esc(g.title)}</span></div>`;
              })
              .join("");
            html += `<div class="cell">${bars}</div>`;
            return;
          }
          let from = gs > ms ? gs : ms,
            to = ge < me ? ge : me;
          if (from <= to) {
            let left = ((from.getDate() - 1) / daysInMonth) * 100,
              right = (to.getDate() / daysInMonth) * 100;
            let title =
              r.type === "curriculumLane"
                ? r.gs
                    .map(
                      (g) =>
                        `${g.title}: ${fmtDate(g.start)}~${fmtDate(g.end)}`,
                    )
                    .join(" / ")
                : `${r.g.title} · ${fmtDate(r.g.start)} ~ ${fmtDate(r.g.end)} · ${r.g.rangeStart || r.g.total}~${r.g.rangeEnd || r.g.total}${unitName(r.g)} · ${recurrenceLabel(r.g)} · ${category(r.g).name}`;
            let col =
              r.type === "curriculumLane"
                ? category(r.gs[0]).color
                : category(r.g).color;
            html += `<div class="cell"><div class="plan-bar" style="left:calc(${left}% + 5px);right:calc(${100 - right}% + 5px);background:${alpha(col, 0.3)}" title="${esc(title)}" onclick="event.stopPropagation();openPlanBarInfo('${r.g.id}')"></div></div>`;
          } else html += '<div class="cell"></div>';
        });
      });
      grid.innerHTML = html;
      grid.querySelectorAll(".month-head").forEach((h) => {
        h.onmouseenter = () => highlightColumn(+h.dataset.col, true);
        h.onmouseleave = () => highlightColumn(+h.dataset.col, false);
        h.onclick = () => openMonth(h.dataset.month);
      });
      $("#annualLegend").innerHTML = state.settings.categories
        .map(
          (c) =>
            `<div class="legend-item"><span class="dot" style="background:${c.color}"></span>${esc(c.name)}</div>`,
        )
        .join("");
    };
    window.renderMonth = function () {
      let m = state._month || state.settings.calendarStart,
        [y, mo] = m.split("-").map(Number),
        first = new Date(y, mo - 1, 1),
        last = new Date(y, mo, 0),
        grid = $("#monthGrid");
      $("#monthTitle").textContent = `${y}년 ${mo}월`;
      let h = ["일", "월", "화", "수", "목", "금", "토"]
        .map((x) => `<div class="month-dow">${x}</div>`)
        .join("");
      let cells = [];
      for (let i = 0; i < first.getDay(); i++)
        cells.push('<div class="mday out"></div>');
      let tsAll = selectedGoals();
      for (let d = 1; d <= last.getDate(); d++) {
        let date = iso(new Date(y, mo - 1, d)),
          ts = tsAll.flatMap((g) =>
            (g.plan || [])
              .filter((t) => t.date === date)
              .map((t) => ({ ...t, g })),
          );
        cells.push(
          `<div class="mday" onclick="openDayDetail('${date}')"><div class="mdate">${d}일</div>${ts
            .slice(0, 6)
            .map((t) => {
              let c = category(t.g);
              return `<div class="mini-plan" style="background:${alpha(c.color, 0.18)};color:${c.color}">${esc(t.g.title)} · ${taskRange(t)}${esc(unitName(t.g))}</div>`;
            })
            .join(
              "",
            )}${ts.length > 6 ? `<div class="small" style="margin-top:5px">+ ${ts.length - 6}개 더</div>` : ""}</div>`,
        );
      }
      grid.innerHTML = h + cells.join("");
    };
    window.openDayDetail = function (date) {
      let ts = selectedGoals().flatMap((g) =>
          (g.plan || [])
            .filter((t) => t.date === date)
            .map((t) => ({ ...t, g })),
        ),
        modal = $("#detailModal");
      $("#detailTitle").textContent = fmtDate(date) + " 계획";
      $("#detailSub").textContent = ts.length
        ? `${ts.length}개의 계획`
        : "계획 없음";
      $("#detailList").innerHTML = ts.length
        ? ts
            .map((t) => {
              let c = category(t.g),
                done = t.done >= t.amount;
              return `<div class="detail-item"><input type="checkbox" ${done ? "checked" : ""} onchange="toggleTask('${t.g.id}','${t.date}',${t.from})"><div style="flex:1"><b>${esc(t.g.title)}</b><div class="small">${taskRange(t)}${esc(unitName(t.g))} · ${esc(recurrenceLabel(t.g))}</div><div class="small" style="color:${c.color}">● ${esc(c.name)}</div></div><button class="secondary task-move" type="button" onclick="openTaskMove('${t.g.id}','${t.date}',${t.from})">날짜 이동</button></div>`;
            })
            .join("")
        : '<div class="empty">이 날짜에는 표시하도록 선택한 계획이 없습니다.</div>';
      modal.classList.add("open");
    };
    function setupV8UI() {
      ensureV8();
      // goals toolbar
      let top = $("#goals .top");
      if (top && !$("#folderBtns")) {
        let wrap = document.createElement("div");
        wrap.id = "folderBtns";
        wrap.className = "folder-tools";
        wrap.innerHTML =
          '<button class="secondary" onclick="newFolder(\'curriculum\')">＋ 커리큘럼 폴더</button><button class="secondary" onclick="newFolder(\'general\')">＋ 일반 폴더</button>';
        let add = top.querySelector("#newGoal2");
        top.insertBefore(wrap, add);
        wrap.appendChild(add);
      }
      if (!$("#goalSortRow")) {
        let card = $("#goals .card"),
          row = document.createElement("div");
        row.id = "goalSortRow";
        row.className = "sort-row";
        row.style.marginBottom = "12px";
        row.innerHTML =
          '<label class="small">정렬 기준</label><select id="goalSort"><option value="created">생성일</option><option value="type">유형</option><option value="end">마감일</option><option value="start">시작일</option><option value="name">이름</option></select>';
        card.insertBefore(row, card.firstChild);
        $("#goalSort").value = state.settings.goalSort;
        $("#goalSort").onchange = () => {
          state.settings.goalSort = $("#goalSort").value;
          saveV8();
        };
      }
      // goal folder field
      if (!$("#gFolder")) {
        let field = document.createElement("div");
        field.className = "field";
        field.innerHTML =
          '<label>폴더</label><select id="gFolder"><option value="">폴더 없음</option></select>';
        $("#gCategory").closest(".row").appendChild(field);
      }
      // calendar controls
      let av = $("#annualView");
      if (av && !$("#calendarSelectPanel")) {
        let sec = av.querySelector(".section-title");
        let controls = document.createElement("div");
        controls.className = "calendar-controls";
        controls.innerHTML =
          '<button class="secondary" id="toggleCalendarSelect">표시 계획 및 폴더 설정</button><button class="reset-icon" id="resetCalendarSelect" title="계획 및 폴더 표시 초기화" aria-label="계획 및 폴더 표시 초기화">↺</button><label class="small">정렬</label><select id="calendarSort"><option value="created">생성일</option><option value="type">유형</option><option value="end">마감일</option><option value="start">시작일</option><option value="name">이름</option></select>';
        sec.appendChild(controls);
        controls.insertAdjacentElement("afterBegin", document.querySelector(`#editCalendarRange`));
        let panel = document.createElement("div");
        panel.id = "calendarSelectPanel";
        panel.className = "calendar-select-panel card";
        av.insertBefore(panel, av.querySelector(".annual-wrap"));
        $("#calendarSort").value = state.settings.calendarSort;
        $("#toggleCalendarSelect").onclick = () => {
          $("#calendarSelectPanel").classList.toggle("open");
          calendarSelectionPanel();
        };
        $("#resetCalendarSelect").onclick = () => {
          state.settings.calendarSelection = { plans: [], folders: [] };
          saveV8();
          calendarSelectionPanel();
        };
        $("#calendarSort").onchange = () => {
          state.settings.calendarSort = $("#calendarSort").value;
          saveV8();
        };
        calendarSelectionPanel();
      }
    }
    const oldRender = window.render;
    window.render = function () {
      ensureV8();
      setupV8UI();
      oldRender();
      renderGoalManagement();
      calendarSelectionPanel();
    };
    setupV8UI();
    // backup UI in settings
    if (!$("#backupBox")) {
      let box = document.createElement("div");
      box.id = "backupBox";
      box.className = "card";
      box.style.marginTop = "18px";
      box.innerHTML =
        '<h2 style="font-size:17px">백업</h2><p class="small">현재 계획·폴더·설정·스탬프 정보를 하나의 JSON 파일로 저장하거나 복원합니다.</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="secondary" id="exportBackup">백업 파일 내보내기</button><button class="secondary" id="importBackupBtn">백업 파일 불러오기</button><input id="importBackup" type="file" accept="application/json,.json" style="display:none"></div>';
      $("#settings").appendChild(box);
      $("#exportBackup").onclick = () => {
        let blob = new Blob([JSON.stringify(state, null, 2)], {
            type: "application/json",
          }),
          a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "backplan-backup-" + iso(new Date()) + ".json";
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      };
      $("#importBackupBtn").onclick = () => $("#importBackup").click();
      $("#importBackup").onchange = (e) => {
        let f = e.target.files[0];
        if (!f) return;
        let r = new FileReader();
        r.onload = () => {
          try {
            let data = JSON.parse(r.result);
            if (!data.goals || !data.settings) throw 0;
            window.showAppConfirm(
              "현재 데이터를 백업 파일로 교체할까요?",
              () => {
                state = data;
                ensureV8();
                saveV8();
                alert("백업을 불러왔습니다.");
              },
              "백업 불러오기",
            );
          } catch (_) {
            alert("올바른 BackPlan 백업 파일이 아닙니다.");
          }
        };
        r.readAsText(f);
      };
    }
    // Patch save/edit/create folder assignments robustly by replacing current goal field values when modal opens/saves.
    const oldCreateBtn = $("#createGoal")?.onclick;
    // Rebind create/edit button to avoid old wrappers when possible.
    if ($("#createGoal"))
      $("#createGoal").onclick = () =>
        editingGoalId ? window.saveEditedGoal() : window.createGoal();
    // Make initial calendar selection empty, but preserve existing if already present.
    ensureV8();
    render();
  })();

(function () {
  const v9Ensure = window.ensureV8 || function () {};
  function v9Init() {
    if (typeof state === "undefined") return;
    state.folders = state.folders || [];
    state.settings = state.settings || {};
    state.settings.calendarSelection = state.settings.calendarSelection || {
      plans: [],
      folders: [],
    };
    state.settings.calendarSelection.plans =
      state.settings.calendarSelection.plans || [];
    state.settings.calendarSelection.folders =
      state.settings.calendarSelection.folders || [];
    state.settings.calendarExpanded = state.settings.calendarExpanded || {};
    state.settings.goalSort = state.settings.goalSort || "created";
    state.settings.calendarSort = state.settings.calendarSort || "created";
  }
  v9Init();

  // 폴더의 실제 소속 계획은 planIds와 계획의 folderId를 모두 인정한다.
  window.folderPlans = function (f) {
    if (!f) return [];
    const ids = new Set(f.planIds || []);
    return state.goals.filter((g) => g.folderId === f.id || ids.has(g.id));
  };

  // 폴더 정렬용 proxy에 id를 반드시 보존한다.
  if (typeof window.folderSortProxy === "function") {
    const original = window.folderSortProxy;
    window.folderSortProxy = function (f, criterion) {
      const x = original(f, criterion) || {};
      x.id = f.id;
      x.name = f.name;
      x.kind = f.type;
      x.createdAt = f.createdAt;
      const ps = window.folderPlans(f);
      if (criterion === "start")
        x.startDate = ps.length
          ? ps.reduce((m, g) => (g.start < m ? g.start : m), "9999-12-31")
          : null;
      else
        x.startDate = ps.length
          ? ps.reduce((m, g) => (g.start < m ? g.start : m), "9999-12-31")
          : null;
      x.endDate = ps.length
        ? ps.reduce((m, g) => (g.end < m ? g.end : m), "9999-12-31")
        : null;
      return x;
    };
  }

  // 캘린더에 폴더를 선택하면 그 폴더의 현재 소속 계획을 항상 포함한다.
  window.selectedGoals = function () {
    v9Init();
    const ids = new Set(state.settings.calendarSelection.plans || []);
    const folderIds = new Set(state.settings.calendarSelection.folders || []);
    state.folders
      .filter((f) => folderIds.has(f.id))
      .forEach((f) => {
        window.folderPlans(f).forEach((g) => ids.add(g.id));
      });
    return state.goals.filter((g) => ids.has(g.id));
  };

  // 내 목표의 폴더 행: 폴더 자체가 최상위 항목이고, 내부 계획은 접었다 펼칠 수 있다.
  window.folderRow = function (f) {
    const plans = window.folderPlans(f);
    const expanded = state.settings.calendarExpanded[f.id] !== false;
    const curriculum = f.type === "curriculum";
    const icon = curriculum ? "📚" : "🗂️";
    const label = curriculum ? "커리큘럼 폴더" : "일반 폴더";
    const children = plans.length
      ? plans.map((g) => goalRow(g)).join("")
      : '<div class="small" style="padding:8px 2px">폴더가 비어 있습니다.</div>';

    return `<div class="folder-row" data-folder-id="${esc(f.id)}">
  <div class="folder-head">
    <div>
      <button class="collapse-btn" onclick="toggleFolder('${f.id}')" title="${expanded ? "접기" : "펼치기"}">${expanded ? "▼" : "▶"}</button>
      <span class="folder-icon ${curriculum ? "curriculum" : "general"}">${icon}</span>
      <span class="folder-title">${esc(f.name)}</span>
      <span class="folder-type">${label}</span>
      <span class="small"> · ${plans.length}개 계획</span>
    </div>
    <div>
      <button class="secondary" onclick="openFolderEditor('${f.id}')">✎ 수정</button>
      <button class="secondary danger" onclick="removeFolder('${f.id}')">삭제</button>
    </div>
  </div>
  ${expanded ? `<div class="child-list">${children}</div>` : ""}
</div>`;
  };

  window.openFolderEditor = function (id) {
    const f = state.folders.find((x) => x.id === id);
    if (!f) return;
    let modal = document.getElementById("v9FolderModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "v9FolderModal";
      modal.className = "modal";
      modal.innerHTML = `<div class="modal-card">
    <div class="modal-head"><h2 id="v9FolderModalTitle">폴더 수정</h2><button class="icon-btn" id="v9FolderClose">×</button></div>
    <div class="field"><label>폴더 이름</label><input id="v9FolderName" type="text"></div>
    <div class="actions"><button class="secondary" id="v9FolderCancel">취소</button><button class="primary" id="v9FolderSave">저장</button></div>
  </div>`;
      document.body.appendChild(modal);
      const close = () => modal.classList.remove("open");
      modal.querySelector("#v9FolderClose").onclick = close;
      modal.querySelector("#v9FolderCancel").onclick = close;
      modal.querySelector("#v9FolderSave").onclick = () => {
        const name = modal.querySelector("#v9FolderName").value.trim();
        if (!name) {
          alert("폴더 이름을 입력해주세요.");
          return;
        }
        const target = state.folders.find((x) => x.id === modal.dataset.id);
        if (!target) return;
        target.name = name;
        saveV8();
        close();
      };
      modal.querySelector("#v9FolderName").addEventListener("keydown", (e) => {
        if (e.key === "Enter") modal.querySelector("#v9FolderSave").click();
        if (e.key === "Escape") close();
      });
    }
    modal.dataset.id = id;
    modal.querySelector("#v9FolderName").value = f.name;
    modal.querySelector("#v9FolderModalTitle").textContent =
      `${f.type === "curriculum" ? "커리큘럼" : "일반"} 폴더 수정`;
    modal.classList.add("open");
    setTimeout(() => modal.querySelector("#v9FolderName").focus(), 30);
  };

  window.removeFolder = function (id) {
    const f = state.folders.find((x) => x.id === id);
    if (!f) return;
    if (
      !confirm(
        `'${f.name}' 폴더를 삭제할까요?\n폴더 안의 계획은 삭제되지 않습니다.`,
      )
    )
      return;
    state.goals.forEach((g) => {
      if (g.folderId === id) g.folderId = null;
    });
    state.folders = state.folders.filter((x) => x.id !== id);
    state.settings.calendarSelection.folders = (
      state.settings.calendarSelection.folders || []
    ).filter((x) => x !== id);
    saveV8();
  };

  // 기존 함수명도 수정/삭제 버튼에서 사용할 수 있도록 연결.
  window.renameFolder = window.openFolderEditor;
  // 삭제 함수는 위의 실제 데이터 삭제 로직을 그대로 사용한다.

  // 폴더 생성 시 planIds를 항상 준비하고, 새 폴더를 곧바로 목록에 반영한다.
  const oldNewFolder = window.newFolder;
  window.newFolder = function (type) {
    if (typeof oldNewFolder === "function") {
      // 기존 함수가 자체 모달을 사용하는 경우 그대로 사용
      return oldNewFolder(type);
    }
  };

  // 기존 렌더링 함수보다 뒤에서 한 번 더 갱신하여 폴더/계획 소속을 확실히 반영.
  const oldRenderGoalManagement = window.renderGoalManagement;
  window.renderGoalManagement = function () {
    v9Init();
    if (typeof oldRenderGoalManagement === "function")
      oldRenderGoalManagement();
  };

  // 월간 캘린더의 계획명은 항상 검정색.
  const style = document.createElement("style");
  style.textContent = "#monthGrid .mini-plan{color:#111 !important}";
  document.head.appendChild(style);

  // 표시 계획 및 폴더 설정 패널에서 폴더 체크 시 실제 소속 계획을 기준으로 선택/표시한다.
  const oldCalendarSelectionPanel = window.calendarSelectionPanel;
  window.calendarSelectionPanel = function () {
    if (typeof oldCalendarSelectionPanel === "function")
      oldCalendarSelectionPanel();
    const panel = document.getElementById("calendarSelectPanel");
    if (!panel) return;
    panel.querySelectorAll("[data-folder-select]").forEach((cb) => {
      cb.onchange = () => {
        v9Init();
        const ids = new Set(state.settings.calendarSelection.folders || []);
        cb.checked
          ? ids.add(cb.dataset.folderSelect)
          : ids.delete(cb.dataset.folderSelect);
        state.settings.calendarSelection.folders = [...ids];
        saveV8();
        window.calendarSelectionPanel();
      };
    });
  };

  v9Init();
})();

// v10: quick one-day plans, flexible plans, and dashboard calendar controls.
// Kept as a final extension so it also works with the folder/calendar enhancements above.
(function () {
  if (typeof state === "undefined") return;

  const persist = () => {
    localStorage.setItem(KEY, JSON.stringify(state));
    window.render();
  };
  const dayIso = (date) => iso(new Date(date.getFullYear(), date.getMonth(), date.getDate()));
  const selectedIds = () => {
    state.settings.calendarSelection ||= { plans: [], folders: [] };
    state.settings.calendarSelection.plans ||= [];
    return state.settings.calendarSelection.plans;
  };
  const addToCalendar = (goal) => {
    const ids = new Set(selectedIds());
    ids.add(goal.id);
    state.settings.calendarSelection.plans = [...ids];
  };
  const folderOptions = (selected = "") =>
    `<option value="">폴더 없음</option>${(state.folders || []).map((f) =>
      `<option value="${f.id}" ${f.id === selected ? "selected" : ""}>${esc(f.name)}</option>`).join("")}`;
  const categoryOptions = (selected = "default") =>
    (state.settings.categories || []).map((c) =>
      `<option value="${c.id}" ${c.id === selected ? "selected" : ""}>${esc(c.name)}</option>`).join("");

  function ensureExtraUI() {
    const dashboardTop = document.querySelector("#dashboard .top");
    const newGoal = document.getElementById("newGoal");
    if (dashboardTop && newGoal) {
      let actions = document.getElementById("dashboardGoalActions");
      if (!actions) {
        actions = document.createElement("div");
        actions.id = "dashboardGoalActions";
        actions.className = "dashboard-goal-actions";
        newGoal.parentNode.insertBefore(actions, newGoal);
        actions.appendChild(newGoal);
      }
      if (!document.getElementById("quickGoal")) {
      const quick = document.createElement("button");
      quick.id = "quickGoal";
      quick.className = "secondary";
      quick.type = "button";
      quick.textContent = "+ 빠른 목표";
      actions.insertBefore(quick, newGoal);
      quick.onclick = openQuickGoal;
      }
    }
    const goalsTop = document.querySelector("#goals .top");
    const normalNewGoal = document.getElementById("newGoal2");
    if (goalsTop && normalNewGoal && !document.getElementById("newFlexibleGoal")) {
      const flexible = document.createElement("button");
      flexible.id = "newFlexibleGoal";
      flexible.className = "secondary";
      flexible.type = "button";
      flexible.textContent = "+ 유동 계획";
      normalNewGoal.parentNode.insertBefore(flexible, normalNewGoal);
      flexible.onclick = () => openFlexibleGoal();
    }
    const taskHeader = document.querySelector("#dashboard .layout .card:nth-child(2) .section-title");
    if (taskHeader && !document.getElementById("dashboardDayNav")) {
      const nav = document.createElement("span");
      nav.id = "dashboardDayNav";
      nav.className = "dashboard-day-nav";
      nav.innerHTML = '<button class="secondary" type="button" id="returnDashboardToday">오늘로</button><button class="secondary" type="button" data-shift="-1" aria-label="어제 할 일">‹</button><input id="dashboardDatePicker" type="date" aria-label="할 일 날짜 선택" /><button class="secondary" type="button" data-shift="1" aria-label="내일 할 일">›</button>';
      taskHeader.insertBefore(nav, document.getElementById("taskDate"));
      nav.querySelectorAll("button").forEach((button) => {
        if (!button.dataset.shift) return;
        button.onclick = () => {
          const base = state._dashboardDate ? new Date(state._dashboardDate + "T00:00:00") : new Date();
          base.setDate(base.getDate() + Number(button.dataset.shift));
          state._dashboardDate = dayIso(base);
          renderDashboardExtras();
        };
      });
      nav.querySelector("#dashboardDatePicker").onchange = (event) => {
        if (!event.target.value) return;
        state._dashboardDate = event.target.value;
        renderDashboardExtras();
      };
      nav.querySelector("#returnDashboardToday").onclick = () => {
        state._dashboardDate = dayIso(new Date());
        renderDashboardExtras();
      };
    }
  }

  function ensurePlanModal() {
    let modal = document.getElementById("simplePlanModal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "simplePlanModal";
    modal.className = "modal-bg";
    modal.innerHTML = `<div class="modal" style="max-width:560px">
      <div class="section-title"><div><h2 id="simplePlanTitle" style="margin:0"></h2><div class="small" id="simplePlanDescription"></div></div><button class="secondary" type="button" data-close>닫기</button></div>
      <div class="form">
        <div class="field"><label>계획 이름</label><input id="simplePlanName" maxlength="100" /></div>
        <div class="row"><div class="field"><label>카테고리</label><select id="simplePlanCategory"></select></div><div class="field"><label>폴더</label><select id="simplePlanFolder"></select></div></div>
        <div class="row" id="simplePlanDates"><div class="field"><label>시작일</label><input id="simplePlanStart" type="date" /></div><div class="field"><label>종료일</label><input id="simplePlanEnd" type="date" /></div></div>
      </div>
      <div class="modal-actions"><button class="secondary" type="button" data-close>취소</button><button class="primary" type="button" id="simplePlanSave">저장</button></div>
    </div>`;
    document.body.appendChild(modal);
    const close = () => modal.classList.remove("open");
    modal.querySelectorAll("[data-close]").forEach((b) => (b.onclick = close));
    modal.onclick = (event) => { if (event.target === modal) close(); };
    modal.querySelector("#simplePlanSave").onclick = saveSimplePlan;
    return modal;
  }

  function openSimple(mode, goal) {
    const modal = ensurePlanModal();
    const today = dayIso(new Date());
    modal.dataset.mode = mode;
    modal.dataset.goalId = goal?.id || "";
    const quick = mode === "quick";
    modal.querySelector("#simplePlanTitle").textContent = goal ? "계획 수정" : quick ? "빠른 목표 만들기" : "유동 계획 만들기";
    modal.querySelector("#simplePlanDescription").textContent = quick
      ? "하루 일정만 빠르게 추가합니다. 역산 계획은 만들지 않습니다."
      : "분량 없이 기간만 정하는 가상의 계획입니다. 일별 화면에서 필요한 날에 직접 추가하세요.";
    modal.querySelector("#simplePlanName").value = goal?.title || "";
    modal.querySelector("#simplePlanCategory").innerHTML = categoryOptions(goal?.categoryId || "default");
    modal.querySelector("#simplePlanFolder").innerHTML = folderOptions(goal?.folderId || "");
    modal.querySelector("#simplePlanStart").value = goal?.start || today;
    modal.querySelector("#simplePlanEnd").value = goal?.end || today;
    modal.querySelector("#simplePlanEnd").closest(".field").style.display = quick ? "none" : "block";
    modal.classList.add("open");
    setTimeout(() => modal.querySelector("#simplePlanName").focus(), 0);
  }
  function openQuickGoal(id) {
    const goal = id ? state.goals.find((g) => g.id === id) : null;
    openSimple("quick", goal);
  }
  window.openQuickGoal = openQuickGoal;
  function openFlexibleGoal(id) {
    const goal = id ? state.goals.find((g) => g.id === id) : null;
    openSimple("flexible", goal);
  }
  window.openFlexibleGoal = openFlexibleGoal;

  function saveSimplePlan() {
    const modal = ensurePlanModal();
    const title = modal.querySelector("#simplePlanName").value.trim();
    const start = modal.querySelector("#simplePlanStart").value;
    const end = modal.dataset.mode === "quick" ? start : modal.querySelector("#simplePlanEnd").value;
    if (!title || !start || !end) return window.alert("계획 이름과 날짜를 입력해주세요.");
    if (end < start) return window.alert("종료일은 시작일보다 빠를 수 없습니다.");
    const existing = state.goals.find((g) => g.id === modal.dataset.goalId);
    const common = { title, start, end, categoryId: modal.querySelector("#simplePlanCategory").value, folderId: modal.querySelector("#simplePlanFolder").value || null };
    if (existing) {
      Object.assign(existing, common);
      if (existing.quick) existing.plan = [{ date: start, from: 1, to: 1, amount: 1, done: existing.plan?.[0]?.done || 0 }];
      modal.classList.remove("open");
      persist();
      return;
    }
    const quick = modal.dataset.mode === "quick";
    const goal = {
      id: crypto.randomUUID(), ...common, quick, flexible: !quick,
      createdAt: new Date().toISOString(), total: 1, rangeStart: 1, rangeEnd: 1,
      unit: "CUSTOM", unitCustom: "건", recurrence: quick ? "ONE_DAY" : "FLEXIBLE",
      plan: quick ? [{ date: start, from: 1, to: 1, amount: 1, done: 0 }] : [],
    };
    state.goals.push(goal);
    if (goal.folderId) {
      const folder = state.folders?.find((f) => f.id === goal.folderId);
      if (folder) { folder.planIds ||= []; folder.planIds.push(goal.id); }
    }
    addToCalendar(goal);
    modal.classList.remove("open");
    persist();
  }

  window.addFlexibleTask = function (goalId, date) {
    const goal = state.goals.find((g) => g.id === goalId && g.flexible);
    if (!goal || date < goal.start || date > goal.end) return;
    if (!goal.plan.some((t) => t.date === date)) goal.plan.push({ date, from: 1, to: 1, amount: 1, done: 0 });
    goal.plan.sort((a, b) => a.date.localeCompare(b.date));
    persist();
    if (document.getElementById("detailModal")?.classList.contains("open")) window.openDayDetail(date);
  };

  function flexibleCandidates(date) {
    return state.goals.filter((g) => g.flexible && g.start <= date && g.end >= date && !(g.plan || []).some((t) => t.date === date));
  }
  function renderDashboardExtras() {
    ensureExtraUI();
    const date = state._dashboardDate || dayIso(new Date());
    const tasks = state.goals.flatMap((g) => (g.plan || []).filter((t) => t.date === date).map((t) => ({ ...t, g })));
    document.getElementById("taskDate").textContent = fmtDate(date);
    const picker = document.getElementById("dashboardDatePicker");
    const todayButton = document.getElementById("returnDashboardToday");
    if (picker) picker.value = date;
    if (todayButton) todayButton.style.display = date === dayIso(new Date()) ? "none" : "inline-flex";
    document.getElementById("todayTasks").innerHTML = tasks.length ? tasks.map(taskHtml).join("") : '<div class="empty">예정된 일이 없습니다.</div>';
    const candidates = flexibleCandidates(date);
    if (candidates.length) document.getElementById("todayTasks").insertAdjacentHTML("beforeend", `<div class="flexible-add-list">${candidates.map((g) => `<div class="flexible-add"><span><b>${esc(g.title)}</b><small>유동 계획</small></span><button class="secondary" type="button" onclick="addFlexibleTask('${g.id}','${date}')">＋ 추가</button></div>`).join("")}</div>`);
    document.getElementById("warning").innerHTML = "";
    const monday = new Date(date + "T00:00:00");
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setDate(d.getDate() + i); return dayIso(d); });
    const week = days.map((d) => {
      const tasksForDay = state.goals.flatMap((g) => (g.plan || []).filter((t) => t.date === d).map((t) => ({ ...t, g })));
      const taskTags = tasksForDay.map((t) => {
        const c = category(t.g);
        return `<div class="week-plan" style="background:${alpha(c.color, 0.16)};color:#111">${esc(t.g.title)}</div>`;
      }).join("");
      const flexibleTags = flexibleCandidates(d).map((g) =>
        `<div class="week-plan flexible-week-plan">${esc(g.title)} <span>＋</span></div>`).join("");
      const weekday = ["월","화","수","목","금","토","일"][new Date(d + "T00:00:00").getDay() === 0 ? 6 : new Date(d + "T00:00:00").getDay() - 1];
      return `<div class="week-day ${d === dayIso(new Date()) ? "today" : ""}" role="button" tabindex="0" onclick="openDayDetail('${d}')" onkeydown="if(event.key==='Enter'||event.key===' '){openDayDetail('${d}')}"><div class="week-day-head"><span>${weekday}</span><b>${Number(d.slice(-2))}</b></div><div class="week-plan-list">${taskTags || ""}${flexibleTags || ""}</div></div>`;
    }).join("");
    const list = document.getElementById("goalList");
    if (list) {
      list.parentElement.querySelector("h2").textContent = "이번 주 캘린더";
      list.parentElement.querySelector("#viewAllGoals")?.remove();
      list.innerHTML = `<div class="dashboard-week">${week}</div><div class="small" style="margin-top:10px">일정을 미리 확인하고, 날짜를 누르면 전체 일별 계획을 볼 수 있습니다.</div>`;
    }
  }

  const previousRender = window.render;
  window.render = function () { ensureExtraUI(); previousRender(); renderDashboardExtras(); };
  const previousGoalRow = window.goalRow;
  window.goalRow = function (g) {
    if (g.quick) {
      const c = category(g);
      return `<div class="goal quick-goal"><div class="goal-head"><div><div class="goal-title"><span class="dot" style="display:inline-block;background:${c.color};margin-right:6px"></span>${esc(g.title)} <span class="virtual-pill">빠른 목표</span></div><div class="small">${fmtDate(g.start)} · 하루 일정</div></div><div><button class="secondary" onclick="openQuickGoal('${g.id}')">수정</button> <button class="secondary danger" onclick="deleteGoal('${g.id}')">삭제</button></div></div></div>`;
    }
    if (!g.flexible) return previousGoalRow(g);
    const c = category(g);
    return `<div class="goal flexible-goal"><div class="goal-head"><div><div class="goal-title"><span class="dot" style="display:inline-block;background:${c.color};margin-right:6px"></span>${esc(g.title)} <span class="virtual-pill">유동 계획</span></div><div class="small">${fmtDate(g.start)} ~ ${fmtDate(g.end)} · 분량 미정</div></div><div><button class="secondary" onclick="openFlexibleGoal('${g.id}')">수정</button> <button class="secondary danger" onclick="deleteGoal('${g.id}')">삭제</button></div></div><div class="small" style="margin-top:8px">일별 화면 또는 오늘 할 일에서 ＋ 추가를 눌러 일정으로 넣을 수 있습니다.</div></div>`;
  };
  const previousAnnual = window.renderCalendar;
  window.renderCalendar = function () {
    const all = state.goals;
    state.goals = all.filter((g) => !g.quick);
    try { previousAnnual(); } finally { state.goals = all; }
    all.filter((g) => g.flexible).forEach((g) => {
      document.querySelectorAll(`[onclick*="openPlanBarInfo('${g.id}')"]`).forEach((bar) => {
        bar.style.background = "#e1e4e8";
        bar.style.opacity = "0.95";
      });
    });
  };
  const previousDayDetail = window.openDayDetail;
  window.openDayDetail = function (date) {
    previousDayDetail(date);
    const list = document.getElementById("detailList");
    const candidates = flexibleCandidates(date);
    if (list && candidates.length) list.insertAdjacentHTML("beforeend", `<div class="flexible-detail-heading">유동 계획</div>${candidates.map((g) => `<div class="detail-item flexible-add"><div style="flex:1"><b>${esc(g.title)}</b><div class="small">분량 미정 · 필요할 때 오늘 일정으로 추가</div></div><button class="secondary" type="button" onclick="addFlexibleTask('${g.id}','${date}')">＋ 추가</button></div>`).join("")}`);
  };
  const previousPlanInfo = window.openPlanBarInfo;
  window.openPlanBarInfo = function (goalId) {
    previousPlanInfo(goalId);
    const dialog = document.getElementById("planBarInfoDialog");
    const actions = dialog?.querySelector(".modal-actions");
    if (!actions || dialog.querySelector("#planBarInfoEdit")) return;
    const edit = document.createElement("button");
    edit.id = "planBarInfoEdit"; edit.className = "secondary"; edit.type = "button"; edit.textContent = "수정하기";
    edit.onclick = () => {
      dialog.classList.remove("open");
      const goal = state.goals.find((g) => g.id === goalId);
      goal?.flexible ? openFlexibleGoal(goalId) : window.openEditGoal(goalId);
    };
    actions.insertBefore(edit, actions.firstChild);
  };
  ensureExtraUI();
  window.render();
})();
(function () {
  if (typeof state === "undefined") return;
  state.folders = (state.folders || []).map((f) => ({
    ...f,
    planIds: Array.isArray(f.planIds) ? f.planIds : [],
  }));
  state.settings.calendarSelection = state.settings.calendarSelection || {
    plans: [],
    folders: [],
  };
  state.settings.calendarSelection.plans =
    state.settings.calendarSelection.plans || [];
  state.settings.calendarSelection.folders =
    state.settings.calendarSelection.folders || [];
  state.settings.goalFolderExpanded = state.settings.goalFolderExpanded || {};
  state.settings.calendarExpanded = state.settings.calendarExpanded || {};
  state.goals.forEach((g) => {
    if (g.folderId) {
      const f = state.folders.find((x) => x.id === g.folderId);
      if (f && !f.planIds.includes(g.id)) f.planIds.push(g.id);
    }
  });
  localStorage.setItem(KEY, JSON.stringify(state));
})();
window.deleteFolder =
  window.deleteFolder ||
  function (id) {
    const f = state.folders.find((x) => x.id === id);
    if (!f) return;
    if (
      !confirm(
        `'${f.name}' 폴더를 삭제할까요?\n폴더 안의 계획은 삭제되지 않습니다.`,
      )
    )
      return;
    state.goals.forEach((g) => {
      if (g.folderId === id) delete g.folderId;
    });
    state.settings.calendarSelection = state.settings.calendarSelection || {
      plans: [],
      folders: [],
    };
    state.settings.calendarSelection.folders = (
      state.settings.calendarSelection.folders || []
    ).filter((x) => x !== id);
    state.folders = state.folders.filter((x) => x.id !== id);
    delete state.settings.goalFolderExpanded?.[id];
    delete state.settings.calendarExpanded?.[id];
    saveV8();
  };

// Shared folder dialog.  Keeping creation and renaming in the same modal avoids
// native browser prompts and guarantees the overlay uses the app's modal layout.
(function () {
  function persistFolderChanges() {
    localStorage.setItem(KEY, JSON.stringify(state));
    render();
  }

  function closeFolderDialog() {
    document.getElementById("folderDialog")?.classList.remove("open");
  }

  function getFolderDialog() {
    let dialog = document.getElementById("folderDialog");
    if (dialog) return dialog;

    dialog = document.createElement("div");
    dialog.id = "folderDialog";
    dialog.className = "modal-bg";
    dialog.innerHTML = `
      <div class="modal" style="max-width: 520px">
        <div class="section-title">
          <div>
            <h2 id="folderDialogTitle" style="margin: 0"></h2>
            <div class="small" id="folderDialogDescription"></div>
          </div>
          <button class="secondary" type="button" id="folderDialogClose">닫기</button>
        </div>
        <div class="field">
          <label for="folderDialogName">폴더 이름</label>
          <input id="folderDialogName" type="text" maxlength="60" autocomplete="off" />
          <div class="small danger" id="folderDialogError" style="display: none; margin-top: 6px"></div>
        </div>
        <div class="modal-actions">
          <button class="secondary" type="button" id="folderDialogCancel">취소</button>
          <button class="primary" type="button" id="folderDialogSave">저장</button>
        </div>
      </div>`;
    document.body.appendChild(dialog);

    dialog.querySelector("#folderDialogClose").onclick = closeFolderDialog;
    dialog.querySelector("#folderDialogCancel").onclick = closeFolderDialog;
    dialog.onclick = (event) => {
      if (event.target === dialog) closeFolderDialog();
    };
    dialog.querySelector("#folderDialogName").onkeydown = (event) => {
      if (event.key === "Enter") dialog.querySelector("#folderDialogSave").click();
      if (event.key === "Escape") closeFolderDialog();
    };
    dialog.querySelector("#folderDialogSave").onclick = () => {
      const name = dialog.querySelector("#folderDialogName").value.trim();
      const error = dialog.querySelector("#folderDialogError");
      if (!name) {
        error.textContent = "폴더 이름을 입력해주세요.";
        error.style.display = "block";
        dialog.querySelector("#folderDialogName").focus();
        return;
      }
      if (dialog.dataset.mode === "create") {
        state.folders.push({
          id: crypto.randomUUID(),
          name,
          type: dialog.dataset.type,
          createdAt: new Date().toISOString(),
          planIds: [],
        });
      } else {
        const folder = state.folders.find((item) => item.id === dialog.dataset.folderId);
        if (!folder) return closeFolderDialog();
        folder.name = name;
      }
      closeFolderDialog();
      persistFolderChanges();
    };
    return dialog;
  }

  function openFolderDialog({ mode, type, folder }) {
    const dialog = getFolderDialog();
    const curriculum = type === "curriculum";
    dialog.dataset.mode = mode;
    dialog.dataset.type = type;
    dialog.dataset.folderId = folder?.id || "";
    dialog.querySelector("#folderDialogTitle").textContent =
      mode === "create" ? "새 폴더 만들기" : "폴더 이름 수정";
    dialog.querySelector("#folderDialogDescription").textContent =
      `${curriculum ? "커리큘럼" : "일반"} 폴더`;
    dialog.querySelector("#folderDialogName").value = folder?.name || "";
    dialog.querySelector("#folderDialogError").style.display = "none";
    dialog.classList.add("open");
    setTimeout(() => dialog.querySelector("#folderDialogName").focus(), 0);
  }

  window.newFolder = function (type) {
    openFolderDialog({ mode: "create", type });
  };
  window.renameFolder = function (id) {
    const folder = state.folders.find((item) => item.id === id);
    if (folder) openFolderDialog({ mode: "edit", type: folder.type, folder });
  };
  window.openFolderEditor = window.renameFolder;

  function getFolderDeleteDialog() {
    let dialog = document.getElementById("folderDeleteDialog");
    if (dialog) return dialog;

    dialog = document.createElement("div");
    dialog.id = "folderDeleteDialog";
    dialog.className = "modal-bg";
    dialog.innerHTML = `
      <div class="modal" style="max-width: 520px">
        <div class="section-title">
          <div>
            <h2 style="margin: 0">폴더 삭제</h2>
            <div class="small" id="folderDeleteDescription"></div>
          </div>
          <button class="secondary" type="button" id="folderDeleteClose">닫기</button>
        </div>
        <div class="warning" style="margin-top: 0">
          폴더를 삭제하면 폴더 자체는 복구할 수 없습니다.
        </div>
        <label class="select-item" style="margin-top: 14px">
          <input id="folderDeletePlans" type="checkbox" />
          <span>폴더 안의 계획도 함께 삭제</span>
        </label>
        <div class="small" style="margin-top: 5px; margin-left: 27px">
          선택하지 않으면 계획은 유지되고 폴더 연결만 해제됩니다.
        </div>
        <div class="modal-actions">
          <button class="secondary" type="button" id="folderDeleteCancel">취소</button>
          <button class="primary" type="button" id="folderDeleteConfirm" style="background: var(--danger)">삭제</button>
        </div>
      </div>`;
    document.body.appendChild(dialog);

    const close = () => dialog.classList.remove("open");
    dialog.querySelector("#folderDeleteClose").onclick = close;
    dialog.querySelector("#folderDeleteCancel").onclick = close;
    dialog.onclick = (event) => {
      if (event.target === dialog) close();
    };
    dialog.querySelector("#folderDeleteConfirm").onclick = () => {
      const folder = state.folders.find((item) => item.id === dialog.dataset.folderId);
      if (!folder) return close();
      const planIds = new Set(
        state.goals
          .filter((goal) =>
            goal.folderId === folder.id || (folder.planIds || []).includes(goal.id),
          )
          .map((goal) => goal.id),
      );
      if (dialog.querySelector("#folderDeletePlans").checked) {
        state.goals = state.goals.filter((goal) => !planIds.has(goal.id));
        state.settings.calendarSelection.plans = (
          state.settings.calendarSelection.plans || []
        ).filter((id) => !planIds.has(id));
      } else {
        state.goals.forEach((goal) => {
          if (goal.folderId === folder.id) goal.folderId = null;
        });
      }
      state.folders = state.folders.filter((item) => item.id !== folder.id);
      state.settings.calendarSelection.folders = (
        state.settings.calendarSelection.folders || []
      ).filter((id) => id !== folder.id);
      delete state.settings.goalFolderExpanded?.[folder.id];
      delete state.settings.calendarExpanded?.[folder.id];
      close();
      persistFolderChanges();
    };
    return dialog;
  }

  function openFolderDeleteDialog(id) {
    const folder = state.folders.find((item) => item.id === id);
    if (!folder) return;
    const dialog = getFolderDeleteDialog();
    const planCount = state.goals.filter(
      (goal) =>
        goal.folderId === folder.id || (folder.planIds || []).includes(goal.id),
    ).length;
    dialog.dataset.folderId = id;
    dialog.querySelector("#folderDeleteDescription").textContent =
      `“${folder.name}” 폴더와 포함된 ${planCount}개 계획`;
    dialog.querySelector("#folderDeletePlans").checked = false;
    dialog.classList.add("open");
  }

  window.deleteFolder = openFolderDeleteDialog;
  window.removeFolder = openFolderDeleteDialog;

  function getAppMessageDialog() {
    let dialog = document.getElementById("appMessageDialog");
    if (dialog) return dialog;
    dialog = document.createElement("div");
    dialog.id = "appMessageDialog";
    dialog.className = "modal-bg";
    dialog.innerHTML = `
      <div class="modal" style="max-width: 460px">
        <h2 id="appMessageTitle">안내</h2>
        <p id="appMessageText" style="white-space: pre-line; margin-bottom: 0"></p>
        <div class="modal-actions">
          <button class="primary" type="button" id="appMessageOk">확인</button>
        </div>
      </div>`;
    document.body.appendChild(dialog);
    const close = () => dialog.classList.remove("open");
    dialog.querySelector("#appMessageOk").onclick = close;
    dialog.onclick = (event) => {
      if (event.target === dialog) close();
    };
    return dialog;
  }

  function showAppMessage(message, title = "안내") {
    const dialog = getAppMessageDialog();
    dialog.querySelector("#appMessageTitle").textContent = title;
    dialog.querySelector("#appMessageText").textContent = String(message);
    dialog.classList.add("open");
  }

  function getAppConfirmDialog() {
    let dialog = document.getElementById("appConfirmDialog");
    if (dialog) return dialog;
    dialog = document.createElement("div");
    dialog.id = "appConfirmDialog";
    dialog.className = "modal-bg";
    dialog.innerHTML = `
      <div class="modal" style="max-width: 460px">
        <h2 id="appConfirmTitle">확인</h2>
        <p id="appConfirmText" style="white-space: pre-line; margin-bottom: 0"></p>
        <div class="modal-actions">
          <button class="secondary" type="button" id="appConfirmCancel">취소</button>
          <button class="primary" type="button" id="appConfirmOk">확인</button>
        </div>
      </div>`;
    document.body.appendChild(dialog);
    const close = () => dialog.classList.remove("open");
    dialog.querySelector("#appConfirmCancel").onclick = close;
    dialog.onclick = (event) => {
      if (event.target === dialog) close();
    };
    return dialog;
  }

  window.showAppConfirm = function (message, onConfirm, title = "확인") {
    const dialog = getAppConfirmDialog();
    dialog.querySelector("#appConfirmTitle").textContent = title;
    dialog.querySelector("#appConfirmText").textContent = String(message);
    dialog.querySelector("#appConfirmOk").onclick = () => {
      dialog.classList.remove("open");
      onConfirm?.();
    };
    dialog.classList.add("open");
  };

  // Legacy validation calls use alert(). Route them through the app UI so no
  // browser-native dialog appears anywhere in the current interface.
  window.alert = (message) => showAppMessage(message);
  // Remaining legacy confirmation branches are no longer used by the active UI.
  // Keep them from ever opening a browser dialog if an old handler is reached.
  window.confirm = (message) => {
    showAppMessage(message, "확인 필요");
    return false;
  };
  window.prompt = () => {
    showAppMessage("이 기능은 앱 내 입력 창을 통해 진행해주세요.");
    return null;
  };

  window.deleteGoal = function (id) {
    const goal = state.goals.find((item) => item.id === id);
    if (!goal) return;
    window.showAppConfirm(`“${goal.title}” 계획을 삭제할까요?`, () => {
      state.goals = state.goals.filter((item) => item.id !== id);
      state.folders.forEach((folder) => {
        folder.planIds = (folder.planIds || []).filter((planId) => planId !== id);
      });
      state.settings.calendarSelection.plans = (
        state.settings.calendarSelection.plans || []
      ).filter((planId) => planId !== id);
      persistFolderChanges();
    }, "계획 삭제");
  };

  function getTaskMoveDialog() {
    let dialog = document.getElementById("taskMoveDialog");
    if (dialog) return dialog;
    dialog = document.createElement("div");
    dialog.id = "taskMoveDialog";
    dialog.className = "modal-bg";
    dialog.innerHTML = `
      <div class="modal" style="max-width: 500px">
        <div class="section-title">
          <div>
            <h2 style="margin: 0">할 일 날짜 이동</h2>
            <div class="small" id="taskMoveDescription"></div>
          </div>
          <button class="secondary" type="button" id="taskMoveClose">닫기</button>
        </div>
        <div class="field">
          <label for="taskMoveDate">새 날짜</label>
          <input id="taskMoveDate" type="date" />
        </div>
        <div class="small" style="margin-top: 8px">
          이동한 날짜는 일일 캘린더와 연간 캘린더에 바로 반영됩니다.
        </div>
        <div class="modal-actions">
          <button class="secondary" type="button" id="taskMoveCancel">취소</button>
          <button class="primary" type="button" id="taskMoveSave">이동</button>
        </div>
      </div>`;
    document.body.appendChild(dialog);
    const close = () => dialog.classList.remove("open");
    dialog.querySelector("#taskMoveClose").onclick = close;
    dialog.querySelector("#taskMoveCancel").onclick = close;
    dialog.onclick = (event) => {
      if (event.target === dialog) close();
    };
    dialog.querySelector("#taskMoveDate").onkeydown = (event) => {
      if (event.key === "Enter") dialog.querySelector("#taskMoveSave").click();
      if (event.key === "Escape") close();
    };
    dialog.querySelector("#taskMoveSave").onclick = () => {
      const goal = state.goals.find((item) => item.id === dialog.dataset.goalId);
      const task = goal?.plan?.find(
        (item) =>
          item.date === dialog.dataset.taskDate &&
          item.from === Number(dialog.dataset.taskFrom),
      );
      const newDate = dialog.querySelector("#taskMoveDate").value;
      if (!goal || !task || !newDate) return;
      const detailWasOpen = $("#detailModal")?.classList.contains("open");
      task.date = newDate;
      goal.plan.sort(
        (a, b) => a.date.localeCompare(b.date) || a.from - b.from,
      );
      // The annual view represents a goal by its first and last scheduled task.
      goal.start = goal.plan[0]?.date || goal.start;
      goal.end = goal.plan[goal.plan.length - 1]?.date || goal.end;
      close();
      persistFolderChanges();
      if (detailWasOpen) window.openDayDetail(newDate);
    };
    return dialog;
  }

  window.openTaskMove = function (goalId, taskDate, taskFrom) {
    const goal = state.goals.find((item) => item.id === goalId);
    const task = goal?.plan?.find(
      (item) => item.date === taskDate && item.from === Number(taskFrom),
    );
    if (!goal || !task) return;
    const dialog = getTaskMoveDialog();
    dialog.dataset.goalId = goalId;
    dialog.dataset.taskDate = taskDate;
    dialog.dataset.taskFrom = taskFrom;
    dialog.querySelector("#taskMoveDescription").textContent =
      `${goal.title} · ${taskRange(task)}${unitName(goal)} · 현재 ${fmtDate(taskDate)}`;
    dialog.querySelector("#taskMoveDate").value = taskDate;
    dialog.classList.add("open");
    setTimeout(() => dialog.querySelector("#taskMoveDate").focus(), 0);
  };

  function getPlanBarInfoDialog() {
    let dialog = document.getElementById("planBarInfoDialog");
    if (dialog) return dialog;
    dialog = document.createElement("div");
    dialog.id = "planBarInfoDialog";
    dialog.className = "modal-bg";
    dialog.innerHTML = `
      <div class="modal" style="max-width: 520px">
        <div class="section-title">
          <div>
            <h2 id="planBarInfoTitle" style="margin: 0"></h2>
            <div class="small" id="planBarInfoCategory"></div>
          </div>
          <button class="secondary" type="button" id="planBarInfoClose">닫기</button>
        </div>
        <div id="planBarInfoBody" class="setting-box"></div>
        <div class="modal-actions">
          <button class="primary" type="button" id="planBarInfoOk">확인</button>
        </div>
      </div>`;
    document.body.appendChild(dialog);
    const close = () => dialog.classList.remove("open");
    dialog.querySelector("#planBarInfoClose").onclick = close;
    dialog.querySelector("#planBarInfoOk").onclick = close;
    dialog.onclick = (event) => {
      if (event.target === dialog) close();
    };
    return dialog;
  }

  window.openPlanBarInfo = function (goalId) {
    const goal = state.goals.find((item) => item.id === goalId);
    if (!goal) return;
    const dialog = getPlanBarInfoDialog();
    const goalCategory = category(goal);
    dialog.querySelector("#planBarInfoTitle").textContent = goal.title;
    dialog.querySelector("#planBarInfoCategory").innerHTML =
      `<span class="dot" style="display:inline-block;background:${goalCategory.color};margin-right:6px"></span>${esc(goalCategory.name)}`;
    dialog.querySelector("#planBarInfoBody").innerHTML = `
      <div class="small">기간</div>
      <div style="margin:3px 0 12px"><b>${fmtDate(goal.start)} ~ ${fmtDate(goal.end)}</b></div>
      <div class="small">계획 분량</div>
      <div style="margin:3px 0 12px"><b>${goal.rangeStart || goal.total}~${goal.rangeEnd || goal.total}${esc(unitName(goal))}</b></div>
      <div class="small">반복</div>
      <div style="margin-top:3px"><b>${esc(recurrenceLabel(goal))}</b></div>`;
    dialog.classList.add("open");
  };
})();

// Final hook: the shared dialog is installed after the calendar extension.
(function () {
  const original = window.openPlanBarInfo;
  window.openPlanBarInfo = function (goalId) {
    original(goalId);
    const dialog = document.getElementById("planBarInfoDialog");
    const actions = dialog?.querySelector(".modal-actions");
    if (!actions || dialog.querySelector("#planBarInfoEdit")) return;
    const edit = document.createElement("button");
    edit.id = "planBarInfoEdit";
    edit.className = "secondary";
    edit.type = "button";
    edit.textContent = "수정하기";
    edit.onclick = () => {
      dialog.classList.remove("open");
      const goal = state.goals.find((g) => g.id === goalId);
      if (goal?.flexible) window.openFlexibleGoal(goalId);
      else if (goal?.quick) window.openQuickGoal(goalId);
      else window.openEditGoal(goalId);
    };
    actions.insertBefore(edit, actions.firstChild);
  };
})();

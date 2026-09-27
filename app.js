(function () {
  "use strict";

  var EL = ["목", "화", "토", "금", "수"];
  var EL_NAME = { "목": "나무", "화": "불", "토": "흙", "금": "쇠", "수": "물" };

  var $ = function (id) { return document.getElementById(id); };
  var place = null;
  var lastSaju = null;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function clockText(h, mi) {
    var ap = h < 12 ? "오전" : "오후";
    var hh = h % 12 === 0 ? 12 : h % 12;
    return ap + " " + hh + "시" + (mi ? " " + mi + "분" : "");
  }

  // ---------- 출생지 ----------
  // 출생지를 모를 때: 한반도 중앙 경도 (한국 표준시 대비 약 30분 보정)
  var UNKNOWN_LON = 127.5;

  PLACES.forEach(function (row, i) {
    var o = document.createElement("option");
    o.value = String(i); o.textContent = row[0];
    $("sido").appendChild(o);
  });

  function fillSgg() {
    var sel = $("sgg");
    sel.innerHTML = "<option value=''>시·군·구</option>";
    var i = $("sido").value;
    if (i === "") { sel.disabled = true; return; }
    PLACES[+i][1].forEach(function (r, j) {
      var o = document.createElement("option");
      o.value = String(j); o.textContent = r[0];
      sel.appendChild(o);
    });
    sel.disabled = $("p-unknown").checked;
    if (PLACES[+i][1].length === 1) sel.value = "0";
  }

  function currentPlace() {
    if ($("p-unknown").checked) return { lon: UNKNOWN_LON, name: null, unknown: true };
    var i = $("sido").value, j = $("sgg").value;
    if (i === "") return null;
    var sido = PLACES[+i];
    if (j === "") return null;
    var r = sido[1][+j];
    var short = sido[0].replace(/(특별자치시|특별자치도|특별시|광역시)$/, "");
    return { lon: r[2], name: (r[0] === sido[0] || r[0] === "세종시") ? r[0] : short + " " + r[0], unknown: false };
  }

  $("sido").addEventListener("change", fillSgg);
  $("p-unknown").addEventListener("change", function () {
    $("sido").disabled = this.checked;
    $("sgg").disabled = this.checked || $("sido").value === "";
  });

  // ---------- 폼 ----------
  function radio(name) { return document.querySelector("input[name=" + name + "]:checked").value; }

  document.querySelectorAll("input[name=cal]").forEach(function (r) {
    r.addEventListener("change", function () { $("leap-wrap").hidden = radio("cal") !== "lunar"; });
  });

  $("t-unknown").addEventListener("change", function () { $("t").disabled = this.checked; });

  function readInput() {
    var y = parseInt($("y").value, 10), m = parseInt($("m").value, 10), d = parseInt($("d").value, 10);
    if (!(y >= 1908 && y <= 2100)) throw new Error("태어난 해는 1908년부터 2100년 사이로 적어 주세요.");
    if (!(m >= 1 && m <= 12)) throw new Error("태어난 달을 확인해 주세요.");
    if (!(d >= 1 && d <= 31)) throw new Error("태어난 날을 확인해 주세요.");
    var cal = radio("cal");
    if (cal === "solar") {
      var dt = new Date(Date.UTC(y, m - 1, d));
      if (dt.getUTCMonth() !== m - 1) throw new Error("달력에 없는 날짜예요.");
    }
    var known = !$("t-unknown").checked;
    var hm = ($("t").value || "").split(":");
    if (known && hm.length < 2) throw new Error("태어난 시각을 적거나 '시각을 몰라요'를 켜 주세요.");
    place = currentPlace();
    if (!place) throw new Error("태어난 곳의 시·도와 시·군·구를 고르거나 '태어난 곳을 몰라요'를 켜 주세요.");
    var input = {
      calendar: cal, leap: $("leap").checked, y: y, m: m, d: d,
      timeKnown: known, h: known ? parseInt(hm[0], 10) : 12, mi: known ? parseInt(hm[1], 10) : 0,
      gender: radio("gender"), longitude: place.lon, ziSect: 1
    };
    return input;
  }

  $("form").addEventListener("submit", function (e) {
    e.preventDefault();
    var err = $("form-err");
    err.hidden = true;
    try {
      var input = readInput();
      lastSaju = Saju.computeSaju(input);
      lastSaju.name = $("name").value.trim();
      render(lastSaju, input);
      resetReading();
      pendingQuestion = $("question").value.trim();
      $("result").hidden = false;
      $("reading-card").hidden = false;
      $("result").scrollIntoView({ behavior: "smooth", block: "start" });
      runReading();
    } catch (ex) {
      err.textContent = ex.message || String(ex);
      err.hidden = false;
    }
  });

  // ---------- 결과 ----------
  var CAPS = { hour: ["시주", "태어난 시"], day: ["일주", "태어난 날"],
               month: ["월주", "태어난 달"], year: ["년주", "태어난 해"] };

  function cell(p, key) {
    var div = document.createElement("div");
    div.className = "pillar" + (p ? "" : " empty") + (key === "day" ? " me" : "");
    var cap = "<div class='cap'>" + CAPS[key][0] + "<small>" + CAPS[key][1] + "</small></div>";
    if (!p) {
      div.innerHTML = cap + "<div class='god'>&nbsp;</div>" +
        "<div class='char'>?<small>모름</small></div><div class='char'>?<small>모름</small></div><div class='god'>&nbsp;</div>";
      return div;
    }
    div.innerHTML = cap +
      "<div class='god'>" + (key === "day" ? "나" : p.ganGod) + "</div>" +
      "<div class='char el-" + p.ganEl + "'>" + p.gz.charAt(0) + "<small>" + p.ko.charAt(0) + " · " + EL_NAME[p.ganEl] + "</small></div>" +
      "<div class='char el-" + p.zhiEl + "'>" + p.gz.charAt(1) + "<small>" + p.ko.charAt(1) + " · " + EL_NAME[p.zhiEl] + "</small></div>" +
      "<div class='god'>" + p.zhiGod + "</div>";
    return div;
  }

  function render(s, input) {
    var parts = [];
    var who = s.name ? esc(s.name) + "님 · " : "";
    var sd = s.solarDate.split("-");
    var dateText = sd[0] + "년 " + (+sd[1]) + "월 " + (+sd[2]) + "일";
    if (input.calendar === "lunar") {
      parts.push("음력 " + input.y + "년 " + input.m + "월 " + input.d + "일" + (input.leap ? "(윤달)" : "") +
                 " (양력 " + dateText + ")");
    } else {
      parts.push(dateText);
    }
    if (s.clock) {
      parts.push(clockText(input.h, input.mi) + " 출생");
      var lm = s.localMeanTime.split(" ")[1].split(":");
      parts.push("태어난 곳 기준으로 보정한 시각 " + clockText(+lm[0], +lm[1]) +
                 (s.utcOffset.dst ? " (당시 서머타임 반영)" : ""));
    } else {
      parts.push("태어난 시각 모름");
    }
    if (place && place.name) parts.push(esc(place.name));
    if (place && place.unknown) parts.push("태어난 곳 모름 (한반도 중앙 기준)");
    $("res-meta").innerHTML = who + parts.join(" · ");

    var box = $("pillars"); box.innerHTML = "";
    ["hour", "day", "month", "year"].forEach(function (k) { box.appendChild(cell(s.pillars[k], k)); });

    var total = 0; EL.forEach(function (k) { total += s.elements[k]; });
    var eb = $("elements"); eb.innerHTML = "";
    EL.forEach(function (k) {
      var n = s.elements[k];
      var row = document.createElement("div");
      row.className = "el-row";
      row.innerHTML = "<span class='el-name'>" + EL_NAME[k] + "<small>" + k + "</small></span>" +
        "<div class='el-bar'><span class='b-" + k + "' style='width:" + (total ? (n / total * 100) : 0) +
        "%'></span></div><span class='el-n'>" + n + "</span>";
      eb.appendChild(row);
    });

    var dwBox = $("daewoon"); dwBox.innerHTML = "";
    var year = new Date().getFullYear(), cur = -1;
    s.daewoon.forEach(function (d, i) { if (d.startYear <= year) cur = i; });
    s.daewoon.forEach(function (d, i) {
      var el = document.createElement("div");
      el.className = "dw" + (i === cur ? " now" : "");
      el.innerHTML = "<div class='age'>" + d.startAge + "세</div><div class='gz'>" + d.gz + "</div>" +
                     "<div>" + d.ko + "</div><div class='yr'>" + d.startYear + "</div>";
      dwBox.appendChild(el);
    });
    $("dw-wrap").hidden = s.daewoon.length === 0;

    $("key-wrap").hidden = !!SajuLLM.CONFIG.WORKER_URL;
    try { $("key").value = sessionStorage.getItem("openai_key") || ""; } catch (e) { /* 저장소 사용 불가 */ }
  }

  // ---------- 질문 ----------
  var CATEGORIES = [
    ["올해 운세", ["올해 전체적인 운은 어떤가요?", "올해 특히 조심할 시기는 언제인가요?",
                  "올해 새로 시작하기 좋은 일은 무엇인가요?", "내년에는 어떤 흐름일까요?"]],
    ["연애·결혼", ["올해 연애운은 어떤가요?", "저와 잘 맞는 사람은 어떤 사람인가요?",
                  "결혼하기 좋은 시기는 언제인가요?", "지금 만나는 사람과 잘 지내려면 무엇을 신경 써야 할까요?"]],
    ["재물", ["재물운은 어떤가요?", "돈을 모으는 데 저에게 맞는 방식은 무엇인가요?",
             "올해 큰 지출은 조심하는 게 좋을까요?", "부업이나 사업 운은 어떤가요?"]],
    ["일·진로", ["저에게 잘 맞는 일은 무엇인가요?", "이직이나 진로를 바꿔도 괜찮을까요?",
                "승진이나 성과 운은 어떤가요?", "창업이 저와 맞을까요?"]],
    ["학업·시험", ["시험운은 어떤가요?", "저에게 맞는 공부 방식은 무엇인가요?",
                  "어떤 분야를 공부하면 좋을까요?"]],
    ["사람 관계", ["사람 관계에서 조심할 점은 무엇인가요?", "저에게 도움이 되는 사람은 어떤 사람인가요?",
                  "가족과의 관계는 어떤가요?"]],
    ["성격", ["제 타고난 성격은 어떤가요?", "제 강점을 살리려면 어떻게 해야 할까요?"]]
  ];

  function chip(text, onClick) {
    var b = document.createElement("button");
    b.type = "button"; b.className = "chip"; b.textContent = text;
    b.setAttribute("aria-pressed", "false");
    b.addEventListener("click", onClick);
    return b;
  }

  function press(box, btn) {
    box.querySelectorAll(".chip").forEach(function (c) {
      c.setAttribute("aria-pressed", c === btn ? "true" : "false");
    });
  }

  function syncQuestionChips() {
    var v = $("question").value.trim();
    $("qs").querySelectorAll(".chip").forEach(function (c) {
      c.setAttribute("aria-pressed", c.textContent === v ? "true" : "false");
    });
  }

  function showCategory(idx, btn) {
    var box = $("qs");
    var same = btn.getAttribute("aria-pressed") === "true";
    press($("cats"), same ? null : btn);
    box.innerHTML = "";
    box.hidden = same;
    if (same) return;
    CATEGORIES[idx][1].forEach(function (q) {
      box.appendChild(chip(q, function () {
        var ta = $("question");
        ta.value = (ta.value.trim() === q) ? "" : q;
        ta.dispatchEvent(new Event("input"));
      }));
    });
    syncQuestionChips();
  }

  CATEGORIES.forEach(function (c, i) {
    var b = chip(c[0], function () { showCategory(i, b); });
    $("cats").appendChild(b);
  });

  $("question").addEventListener("input", function () {
    $("q-count").textContent = this.value.length + " / " + SajuLLM.MAX_Q;
    syncQuestionChips();
  });

  // ---------- 풀이 ----------
  var SECTIONS = [
    ["summary", "한눈에 보기"], ["personality", "타고난 성향"], ["elements_balance", "오행의 균형"],
    ["strengths", "강점"], ["cautions", "조심하면 좋은 점"], ["career", "일과 진로"],
    ["relationships", "사람과의 관계"], ["current_daewoon", "지금의 대운"], ["this_year", "올해의 흐름"]
  ];
  var FOLLOW_EXAMPLES = ["좀 더 쉽게 설명해 주세요.", "올해 특히 조심할 시기는 언제인가요?",
                         "제 강점을 살리려면 어떻게 해야 할까요?"];
  var pendingQuestion = "";
  var busy = false;

  function resetReading() {
    $("reading").innerHTML = ""; $("qa").innerHTML = ""; $("f-qa").innerHTML = ""; $("ai-status").textContent = "";
    $("follow").hidden = true;
    $("ai-btn").hidden = true;
  }

  function addQA(q, a, box) {
    var item = document.createElement("div");
    item.className = "qa-item";
    var pq = document.createElement("p"); pq.className = "qa-q"; pq.textContent = q;
    var pa = document.createElement("p"); pa.className = "qa-a"; pa.textContent = a;
    item.appendChild(pq); item.appendChild(pa);
    (box || $("qa")).appendChild(item);
    return item;
  }

  function apiKey() {
    if (SajuLLM.CONFIG.WORKER_URL) return "";
    var key = $("key").value.trim();
    if (key) { try { sessionStorage.setItem("openai_key", key); } catch (e) { /* 저장소 사용 불가 */ } }
    return key;
  }

  async function runReading() {
    if (!lastSaju || busy) return;
    var status = $("ai-status");
    var key = apiKey();
    if (!SajuLLM.CONFIG.WORKER_URL && !key) {
      $("key-wrap").hidden = false; $("ai-btn").hidden = false;
      status.textContent = "풀이를 보려면 API 키를 입력해 주세요.";
      return;
    }
    busy = true; $("ai-btn").disabled = true;
    status.textContent = "풀이를 준비하고 있어요. 30초에서 1분 정도 걸려요.";
    try {
      var q = pendingQuestion;
      var r = await SajuLLM.requestReading(lastSaju, key, q, "reading");
      if (q && r.question_answer) addQA(q, r.question_answer);
      var out = $("reading");
      SECTIONS.forEach(function (sec) {
        var v = r[sec[0]];
        if (v == null) return;
        var s = document.createElement("section");
        var h = document.createElement("h4"); h.textContent = sec[1]; s.appendChild(h);
        if (Array.isArray(v)) {
          var ul = document.createElement("ul");
          v.forEach(function (t) { var li = document.createElement("li"); li.textContent = t; ul.appendChild(li); });
          s.appendChild(ul);
        } else {
          var p = document.createElement("p"); p.textContent = v; s.appendChild(p);
        }
        out.appendChild(s);
      });
      status.textContent = "";
      $("ai-btn").hidden = true; $("key-wrap").hidden = true;
      $("follow").hidden = false;
    } catch (ex) {
      status.textContent = "풀이를 불러오지 못했어요. " + (ex.message || ex);
      $("ai-btn").hidden = false; $("ai-btn").textContent = "다시 시도";
    } finally {
      busy = false; $("ai-btn").disabled = false;
    }
  }

  $("ai-btn").addEventListener("click", runReading);

  FOLLOW_EXAMPLES.forEach(function (q) {
    $("f-chips").appendChild(chip(q, function () { $("f-question").value = q; $("f-question").focus(); }));
  });

  $("ask-btn").addEventListener("click", async function () {
    if (!lastSaju || busy) return;
    var q = $("f-question").value.trim();
    var status = $("ai-status");
    if (!q) { $("f-question").focus(); return; }
    busy = true; this.disabled = true;
    var btn = this;
    btn.textContent = "답을 준비하고 있어요…";
    try {
      var ans = await SajuLLM.requestReading(lastSaju, apiKey(), q, "ask");
      addQA(q, ans.answer, $("f-qa")).scrollIntoView({ behavior: "smooth", block: "nearest" });
      $("f-question").value = "";
      status.textContent = "";
    } catch (ex) {
      status.textContent = "답을 불러오지 못했어요. " + (ex.message || ex);
    } finally {
      busy = false; btn.disabled = false; btn.textContent = "질문하기";
    }
  });
})();

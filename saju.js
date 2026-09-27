/* 사주 계산 엔진. lunar-javascript(전역 Solar, Lunar)에 의존.
 * 년·월주: 출생 순간을 베이징 시각(UTC+8)으로 바꿔 절기 시각과 비교 (라이브러리 절기가 UTC+8 기준).
 * 일·시주: 출생지 경도 기준 평균태양시.
 */
(function (global) {
  "use strict";

  var GAN = "甲乙丙丁戊己庚辛壬癸";
  var ZHI = "子丑寅卯辰巳午未申酉戌亥";
  var GAN_KO = "갑을병정무기경신임계";
  var ZHI_KO = "자축인묘진사오미신유술해";
  var GAN_EL = ["목", "목", "화", "화", "토", "토", "금", "금", "수", "수"];
  var ZHI_EL = ["수", "토", "목", "목", "토", "화", "화", "토", "금", "금", "토", "수"];
  // 지지 본기(정기) 천간
  var ZHI_MAIN_GAN = "癸己甲乙戊丙丁己庚辛戊壬";
  var EL_ORDER = ["목", "화", "토", "금", "수"];

  // 한국 표준시 이력 (분 단위 UTC 오프셋)
  var OFFSETS = [
    { from: "1908-04-01", to: "1911-12-31", min: 510 },
    { from: "1912-01-01", to: "1954-03-20", min: 540 },
    { from: "1954-03-21", to: "1961-08-09", min: 510 },
    { from: "1961-08-10", to: "9999-12-31", min: 540 }
  ];
  // 한국 서머타임 시행 기간 (+60분). 날짜 단위 근사.
  var DST = [
    ["1948-06-01", "1948-09-12"], ["1949-04-03", "1949-09-10"],
    ["1950-04-01", "1950-09-09"], ["1951-05-06", "1951-09-08"],
    ["1955-05-05", "1955-09-08"], ["1956-05-20", "1956-09-29"],
    ["1957-05-05", "1957-09-21"], ["1958-05-04", "1958-09-20"],
    ["1959-05-03", "1959-09-19"], ["1960-05-01", "1960-09-17"],
    ["1987-05-10", "1987-10-11"], ["1988-05-08", "1988-10-09"]
  ];

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function ymd(y, m, d) { return y + "-" + pad(m) + "-" + pad(d); }

  function utcOffsetMinutes(y, m, d) {
    var key = ymd(y, m, d), off = 540, i;
    for (i = 0; i < OFFSETS.length; i++) {
      if (key >= OFFSETS[i].from && key <= OFFSETS[i].to) { off = OFFSETS[i].min; break; }
    }
    var dst = false;
    for (i = 0; i < DST.length; i++) {
      if (key >= DST[i][0] && key <= DST[i][1]) { dst = true; break; }
    }
    return { base: off, dst: dst, total: off + (dst ? 60 : 0) };
  }

  // 벽시계 시각 + 오프셋(분) -> 다른 오프셋의 벽시계 시각
  function shiftClock(y, m, d, h, mi, fromOffMin, toOffMin) {
    var utcMs = Date.UTC(y, m - 1, d, h, mi) - fromOffMin * 60000;
    var t = new Date(utcMs + toOffMin * 60000);
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(),
             h: t.getUTCHours(), mi: t.getUTCMinutes() };
  }

  function split(gz) {
    var g = GAN.indexOf(gz.charAt(0)), z = ZHI.indexOf(gz.charAt(1));
    return { gz: gz, gan: g, zhi: z,
             ko: GAN_KO.charAt(g) + ZHI_KO.charAt(z),
             ganEl: GAN_EL[g], zhiEl: ZHI_EL[z] };
  }

  // 십성: 일간 기준으로 대상 천간과의 관계
  function tenGod(dayGan, g) {
    var me = Math.floor(dayGan / 2), other = Math.floor(g / 2);
    var same = (dayGan % 2) === (g % 2);
    var rel = (other - me + 5) % 5; // 0 같음, 1 내가 생함, 2 내가 극함, 3 나를 극함, 4 나를 생함
    return [["비견", "겁재"], ["식신", "상관"], ["편재", "정재"],
            ["편관", "정관"], ["편인", "정인"]][rel][same ? 0 : 1];
  }

  /**
   * input: { calendar: "solar"|"lunar", leap: bool, y, m, d,
   *          timeKnown: bool, h, mi, gender: "M"|"F", longitude: number,
   *          ziSect: 1|2,    (ziSect 1: 23시부터 다음날 일주, 2: 자정에 일주 변경)
   *          utcOffsetMin }  (해외 출생 시 현지 UTC 오프셋(분). 없으면 한국 표준시 이력 적용)
   */
  function computeSaju(input) {
    var y = input.y, m = input.m, d = input.d;
    if (input.calendar === "lunar") {
      var lm = input.leap ? -m : m;
      var s = Lunar.fromYmd(y, lm, d).getSolar();
      y = s.getYear(); m = s.getMonth(); d = s.getDay();
    }
    var timeKnown = !!input.timeKnown;
    var h = timeKnown ? input.h : 12, mi = timeKnown ? input.mi : 0;
    var lon = (typeof input.longitude === "number") ? input.longitude : 126.98;

    var off = (typeof input.utcOffsetMin === "number")
      ? { base: input.utcOffsetMin, dst: false, total: input.utcOffsetMin }
      : utcOffsetMinutes(y, m, d);
    // 년·월주용: 베이징 시각
    var bj = shiftClock(y, m, d, h, mi, off.total, 480);
    // 일·시주용: 경도 기준 평균태양시
    var lmtOff = Math.round(lon * 4); // 경도 1도 = 4분
    var lmt = shiftClock(y, m, d, h, mi, off.total, lmtOff);

    var ecBJ = Solar.fromYmdHms(bj.y, bj.m, bj.d, bj.h, bj.mi, 0).getLunar().getEightChar();
    var ecL = Solar.fromYmdHms(lmt.y, lmt.m, lmt.d, lmt.h, lmt.mi, 0).getLunar().getEightChar();
    ecL.setSect(input.ziSect === 2 ? 2 : 1);

    var pillars = {
      year: split(ecBJ.getYear()),
      month: split(ecBJ.getMonth()),
      day: split(ecL.getDay()),
      hour: timeKnown ? split(ecL.getTime()) : null
    };
    var dg = pillars.day.gan;

    var counts = { "목": 0, "화": 0, "토": 0, "금": 0, "수": 0 };
    ["year", "month", "day", "hour"].forEach(function (k) {
      var p = pillars[k];
      if (!p) return;
      counts[p.ganEl]++; counts[p.zhiEl]++;
      p.ganGod = (k === "day") ? "일간" : tenGod(dg, p.gan);
      p.zhiGod = tenGod(dg, GAN.indexOf(ZHI_MAIN_GAN.charAt(p.zhi)));
    });

    var daewoon = [];
    if (input.gender === "M" || input.gender === "F") {
      var yun = ecBJ.getYun(input.gender === "M" ? 1 : 0);
      var list = yun.getDaYun();
      for (var i = 1; i < list.length && daewoon.length < 8; i++) {
        var p2 = split(list[i].getGanZhi());
        daewoon.push({ startAge: list[i].getStartAge(), startYear: list[i].getStartYear(),
                       gz: p2.gz, ko: p2.ko, ganEl: p2.ganEl, zhiEl: p2.zhiEl,
                       ganGod: tenGod(dg, p2.gan),
                       zhiGod: tenGod(dg, GAN.indexOf(ZHI_MAIN_GAN.charAt(p2.zhi))) });
      }
    }

    return {
      solarDate: ymd(y, m, d),
      clock: timeKnown ? pad(h) + ":" + pad(mi) : null,
      utcOffset: off,
      localMeanTime: timeKnown ? ymd(lmt.y, lmt.m, lmt.d) + " " + pad(lmt.h) + ":" + pad(lmt.mi) : null,
      pillars: pillars,
      dayMaster: { gz: GAN.charAt(dg), ko: GAN_KO.charAt(dg), el: GAN_EL[dg],
                   yin: dg % 2 === 1 },
      elements: counts,
      elementOrder: EL_ORDER,
      daewoon: daewoon
    };
  }

  function yearPillar(year) {
    // 해당 연도 7월 1일 기준 년주 (입춘 이후)
    return split(Solar.fromYmd(year, 7, 1).getLunar().getYearInGanZhiExact());
  }

  global.Saju = { computeSaju: computeSaju, yearPillar: yearPillar, tenGod: tenGod };
})(window);

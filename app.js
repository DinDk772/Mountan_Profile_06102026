(function () {
  const DATA = window.DASHBOARD_DATA;
  if (!DATA) {
    document.body.innerHTML = "<p>Нет data.js — запустите build_interactive_dashboard.py</p>";
    return;
  }

  const CHART = {
    teal: "#3db8b0",
    blue: "#4a7fd4",
    violet: "#7b6cf6",
    gold: "#c9a962",
    accent2: "#5b8def",
  };

  const OBLAST_ALL = "__all_oblasts__";

  let chartInstance = null;
  let modalContext = null;

  const el = (id) => document.getElementById(id);

  function fmtNum(n) {
    if (n == null || Number.isNaN(n)) return "—";
    const v = Number(n);
    if (Math.abs(v) >= 1000) return Math.round(v).toLocaleString("ru-RU").replace(/,/g, " ");
    if (Math.abs(v - Math.round(v)) < 0.05) return String(Math.round(v));
    return v.toFixed(1);
  }

  function initPage() {
    el("page-title").textContent = DATA.meta.title;
    el("page-intro").textContent = DATA.meta.intro || "";
    renderSources();

    const root = el("sectors-root");
    const sectors =
      DATA.sectors ||
      [
        {
          id: "all",
          title: "Показатели",
          indicators: [
            ...(DATA.themes || []).map((t) => ({ ...t, kind: "theme" })),
            ...(DATA.egr || []).map((b) => ({ ...b, kind: "egr" })),
          ],
        },
      ];
    sectors.forEach((sec) => root.appendChild(buildSectorSection(sec)));

    wireModal();
  }

  function renderSources() {
    const list = el("sources-list");
    list.innerHTML = "";
    (DATA.meta.sources || []).forEach((s) => {
      const li = document.createElement("li");
      li.textContent = s.name;
      if (s.note) {
        const span = document.createElement("span");
        span.className = "source-note";
        span.textContent = ` — ${s.note}`;
        li.appendChild(span);
      }
      list.appendChild(li);
    });
  }

  function buildSectorSection(sector) {
    const section = document.createElement("section");
    section.className = "sector-block";
    section.dataset.sectorId = sector.id;
    const h = document.createElement("h2");
    h.className = "sector-title";
    h.textContent = sector.title;
    section.appendChild(h);
    const grid = document.createElement("div");
    grid.className = "indicator-grid";
    (sector.indicators || []).forEach((item) => grid.appendChild(buildIndicatorTile(item)));
    section.appendChild(grid);
    return section;
  }

  function buildIndicatorTile(item) {
    if (item.kind === "egr") return buildEgrTile(item);
    return buildThemeTile(item);
  }

  function buildThemeTile(theme) {
    const tile = document.createElement("article");
    tile.className = "indicator-tile";
    const k0 = theme.summary?.kpis?.[0];
    const k1 = theme.summary?.kpis?.[1];
    let mainVal = "—";
    let mainLbl = theme.title;
    let secondary = "";
    if (k0) {
      mainVal = k0.suffix ? `${k0.value}${k0.suffix}` : fmtNum(k0.value);
      mainLbl = k0.label;
      if (k0.value24 != null) secondary = `${fmtNum(k0.value)} → ${fmtNum(k0.value24)}`;
      else if (k0.delta != null) secondary = `+${k0.delta}`;
      else if (k0.pct != null) secondary = `${k0.pct > 0 ? "+" : ""}${k0.pct.toFixed(1)}%`;
    }
    tile.innerHTML = `
      <h3 class="tile-title">${theme.title}</h3>
      <p class="tile-sub">${theme.subtitle || ""}</p>
      <div class="tile-kpi">
        <div class="val">${mainVal}</div>
        <div class="lbl">${mainLbl}</div>
        ${secondary ? `<div class="tile-kpi-secondary">${secondary}</div>` : ""}
      </div>
    `;
    if (k1 && !k0?.value24) {
      const extra = document.createElement("div");
      extra.className = "tile-kpi-secondary";
      extra.textContent = `${k1.label}: ${k1.suffix ? k1.value + k1.suffix : fmtNum(k1.value)}`;
      tile.querySelector(".tile-kpi").appendChild(extra);
    }
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-tile";
    btn.textContent = "Диаграммы";
    btn.addEventListener("click", () => openModal({ kind: "theme", theme }));
    tile.appendChild(btn);
    return tile;
  }

  function buildEgrTile(item) {
    const tile = document.createElement("article");
    tile.className = "indicator-tile";
    const kr = item.data.nodes.KR;
    tile.innerHTML = `
      <h3 class="tile-title">${item.title}</h3>
      <p class="tile-sub">${item.subtitle || ""} · ${item.year}</p>
      <div class="tile-kpi">
        <div class="val">${fmtNum(kr?.total || 0)}</div>
        <div class="lbl">Итого, КР</div>
      </div>
    `;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-tile";
    btn.textContent = "Диаграммы";
    btn.addEventListener("click", () => openModal({ kind: "egr", block: item }));
    tile.appendChild(btn);
    return tile;
  }

  function wireModal() {
    document.querySelectorAll("[data-close]").forEach((n) =>
      n.addEventListener("click", closeModal)
    );
    ["f-indicator", "f-year-mode", "f-level", "f-oblast", "f-rayon"].forEach((id) => {
      el(id).addEventListener("change", renderChart);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeModal();
    });
  }

  function openModal(ctx) {
    modalContext = ctx;
    el("modal").classList.remove("hidden");
    if (ctx.kind === "theme") {
      el("modal-title").textContent = ctx.theme.title;
      el("f-year-mode").innerHTML = `
        <option value="compare">2023 и 2024</option>
        <option value="2023">2023</option>
        <option value="2024">2024</option>
        <option value="2025">2025*</option>
      `;
      populateFiltersTheme(ctx.theme);
    } else {
      el("modal-title").textContent = `${ctx.block.title} — ${ctx.block.year}`;
      populateFiltersEgr(ctx.block);
      updateEgrLevelVisibility();
    }
    renderChart();
  }

  function closeModal() {
    el("modal").classList.add("hidden");
    modalContext = null;
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
  }

  function populateFiltersTheme(theme) {
    const ind = el("f-indicator");
    ind.innerHTML = "";
    const indicators = listIndicators(theme);
    indicators.forEach((opt, i) => {
      const o = document.createElement("option");
      o.value = String(i);
      o.textContent = indicatorOptionText(opt);
      ind.appendChild(o);
    });
    const level = el("f-level");
    level.innerHTML = "";
    const map = {
      kr: "Кыргызская Республика",
      oblast: "Районы области",
      rayon: "Район / город",
    };
    theme.levels.forEach((lv) => {
      const o = document.createElement("option");
      o.value = lv;
      o.textContent = map[lv] || lv;
      level.appendChild(o);
    });
    fillOblastOptions(theme);
    updateLevelVisibility(theme);
  }

  function listIndicators(theme) {
    if (theme.type === "med") return theme.data.indicators;
    if (theme.type === "units_children")
      return [
        {
          label: theme.unit_label,
          key: "units",
          unit: theme.units_unit || "ед.",
        },
        {
          label: theme.child_label,
          key: "children",
          unit: theme.children_unit || "чел.",
        },
      ];
    if (theme.type === "ved1")
      return [
        { label: "Оборот", key: "turnover", unit: "млн тыс. USD" },
        { label: "Экспорт", key: "export", unit: "млн тыс. USD" },
        { label: "Импорт", key: "import", unit: "млн тыс. USD" },
      ];
    if (theme.type === "simple_pair" || theme.type === "ved_flows")
      return theme.data.rows.map((r, i) => ({
        label: r.label,
        key: String(i),
        unit: r.unit || "",
      }));
    return [{ label: "Значение", key: "0", unit: "" }];
  }

  function indicatorOptionText(ind) {
    return ind.unit ? `${ind.label} (${ind.unit})` : ind.label;
  }

  function chartHeading(name, unit) {
    return unit ? `${name}, ${unit}` : name;
  }

  function appendOblastChoices(sel, entries) {
    const all = document.createElement("option");
    all.value = OBLAST_ALL;
    all.textContent = "Все области";
    sel.appendChild(all);
    entries.forEach(([value, label]) => {
      const o = document.createElement("option");
      o.value = value;
      o.textContent = label;
      sel.appendChild(o);
    });
    if (sel.options.length > 1) sel.selectedIndex = 1;
  }

  function fillOblastOptions(theme) {
    const sel = el("f-oblast");
    sel.innerHTML = "";
    if (theme.type === "med") {
      const entries = theme.data.order
        .filter((k) => k !== "KR")
        .map((k) => [k, theme.data.nodes[k].display]);
      appendOblastChoices(sel, entries);
    } else if (theme.type === "units_children") {
      const entries = Object.keys(theme.data.oblasts)
        .sort()
        .map((k) => [k, theme.data.oblasts[k].display]);
      appendOblastChoices(sel, entries);
    } else if (theme.type === "ved1") {
      const entries = Object.keys(theme.data)
        .filter((k) => k !== "KR")
        .sort()
        .map((k) => [k, theme.data[k].display]);
      appendOblastChoices(sel, entries);
    }
    fillRayonOptions(theme);
  }

  function fillRayonOptions(theme) {
    const sel = el("f-rayon");
    sel.innerHTML = "";
    const obKey = el("f-oblast").value;
    if (theme.type === "units_children" && theme.data.oblasts[obKey]) {
      const rays = theme.data.oblasts[obKey].rayons || {};
      Object.keys(rays)
        .sort()
        .forEach((k) => {
          const o = document.createElement("option");
          o.value = k;
          o.textContent = rays[k].display || k;
          sel.appendChild(o);
        });
    }
  }

  function updateLevelVisibility(theme) {
    const lv = el("f-level").value;
    el("wrap-oblast").classList.toggle("hidden", lv === "kr");
    el("wrap-rayon").classList.toggle("hidden", lv !== "rayon");
    if (lv === "oblast" || lv === "rayon") fillRayonOptions(theme);
  }

  function updateEgrLevelVisibility() {
    const lv = el("f-level").value;
    el("wrap-oblast").classList.toggle("hidden", lv === "kr");
    el("wrap-rayon").classList.toggle("hidden", lv !== "rayon");
    if (lv === "rayon" && modalContext?.kind === "egr") fillEgrRayons(modalContext.block);
  }

  el("f-level").addEventListener("change", () => {
    if (modalContext?.kind === "theme") updateLevelVisibility(modalContext.theme);
    if (modalContext?.kind === "egr") updateEgrLevelVisibility();
    renderChart();
  });
  el("f-oblast").addEventListener("change", () => {
    if (modalContext?.kind === "theme") fillRayonOptions(modalContext.theme);
    renderChart();
  });

  function populateFiltersEgr(block) {
    const ind = el("f-indicator");
    ind.innerHTML = "";
    const o0 = document.createElement("option");
    o0.value = "total";
    o0.textContent = `Итого субъектов (${block.egr_unit || "ед."})`;
    ind.appendChild(o0);
    const o1 = document.createElement("option");
    o1.value = "activities";
    o1.textContent = `По видам A–S (${block.egr_unit || "ед."})`;
    ind.appendChild(o1);
    el("f-level").innerHTML = `
      <option value="kr">Кыргызская Республика</option>
      <option value="oblast">Область</option>
      <option value="rayon">Район</option>
    `;
    const sel = el("f-oblast");
    sel.innerHTML = "";
    const entries = Object.values(block.data.nodes)
      .filter((n) => n.level === "oblast")
      .sort((a, b) => a.display.localeCompare(b.display))
      .map((n) => [n.id, n.display]);
    appendOblastChoices(sel, entries);
    fillEgrRayons(block);
    el("f-year-mode").innerHTML = `<option value="single">Данные на ${block.year}</option>`;
  }

  function fillEgrRayons(block) {
    const sel = el("f-rayon");
    sel.innerHTML = "";
    const ob = el("f-oblast").value;
    const node = block.data.nodes[ob];
    if (!node || !node.rayons) return;
    Object.keys(node.rayons).forEach((rid) => {
      const r = block.data.nodes[rid];
      if (!r) return;
      const o = document.createElement("option");
      o.value = rid;
      o.textContent = r.display;
      sel.appendChild(o);
    });
  }

  el("f-oblast").addEventListener("change", () => {
    if (modalContext?.kind === "egr") fillEgrRayons(modalContext.block);
  });

  function renderChart() {
    if (!modalContext) return;
    if (chartInstance) chartInstance.destroy();
    const cfg =
      modalContext.kind === "theme"
        ? buildThemeChart(modalContext.theme)
        : buildEgrChart(modalContext.block);
    chartInstance = new Chart(el("detail-chart"), cfg);
  }

  function buildThemeChart(theme) {
    const yearMode = el("f-year-mode").value;
    const level = el("f-level").value;
    const indIdx = Number(el("f-indicator").value);
    const indicators = listIndicators(theme);
    const ind = indicators[indIdx];

    if (theme.type === "med") {
      return buildMedChart(theme, indIdx, yearMode, level);
    }
    if (theme.type === "units_children") {
      return buildUnitsChart(theme, ind.key, yearMode, level, ind.unit);
    }
    if (theme.type === "ved1") {
      return buildVed1Chart(theme, ind.key, yearMode, level, ind.unit);
    }
    return buildSimpleChart(theme, indIdx, yearMode, ind.unit);
  }

  function buildMedChart(theme, indIdx, yearMode, level) {
    let labels, d23, d24;
    const ind = theme.data.indicators[indIdx];
    if (level === "kr") {
      labels = [theme.data.nodes.KR.display];
      d23 = [theme.data.nodes.KR.values["2023"][indIdx]];
      d24 = [theme.data.nodes.KR.values["2024"][indIdx]];
    } else if (level === "oblast") {
      const obKey = el("f-oblast").value;
      if (obKey === OBLAST_ALL) {
        const keys = theme.data.order.filter((k) => k !== "KR");
        labels = keys.map((k) => theme.data.nodes[k].display);
        d23 = keys.map((k) => theme.data.nodes[k].values["2023"][indIdx]);
        d24 = keys.map((k) => theme.data.nodes[k].values["2024"][indIdx]);
      } else {
        const node = theme.data.nodes[obKey];
        labels = [node.display];
        d23 = [node.values["2023"][indIdx]];
        d24 = [node.values["2024"][indIdx]];
      }
    } else if (level === "rayon") {
      labels = ["Нет данных по районам"];
      d23 = [0];
      d24 = [0];
    } else {
      labels = ["—"];
      d23 = [0];
      d24 = [0];
    }
    let title = ind.label;
    if (level === "oblast" && el("f-oblast").value !== OBLAST_ALL) {
      title = `${ind.label} · ${theme.data.nodes[el("f-oblast").value].display}`;
    }
    return barConfig(title, labels, yearMode, d23, d24, theme.years, ind.unit);
  }

  function buildUnitsChart(theme, field, yearMode, level, unit) {
    const labels = [];
    const d23 = [];
    const d24 = [];
    let titleSuffix = "";

    if (level === "kr") {
      labels.push("Кыргызская Республика");
      d23.push(theme.data.kr[field]["2023"]);
      d24.push(theme.data.kr[field]["2024"]);
    } else if (level === "oblast") {
      const obKey = el("f-oblast").value;
      if (obKey === OBLAST_ALL) {
        Object.keys(theme.data.oblasts)
          .sort()
          .forEach((k) => {
            const o = theme.data.oblasts[k];
            labels.push(o.display);
            d23.push(o[field]["2023"]);
            d24.push(o[field]["2024"]);
          });
      } else {
        const ob = theme.data.oblasts[obKey];
        titleSuffix = ob ? ` · ${ob.display}` : "";
        const rays = ob?.rayons || {};
        const keys = Object.keys(rays).sort();
        if (keys.length) {
          keys.forEach((k) => {
            const r = rays[k];
            labels.push(r.display);
            d23.push(r[field]["2023"]);
            d24.push(r[field]["2024"]);
          });
        } else if (ob) {
          labels.push(ob.display);
          d23.push(ob[field]["2023"]);
          d24.push(ob[field]["2024"]);
        }
      }
    } else if (level === "rayon") {
      const ob = theme.data.oblasts[el("f-oblast").value];
      const ray = ob?.rayons?.[el("f-rayon").value];
      if (ray) {
        labels.push(ray.display);
        d23.push(ray[field]["2023"]);
        d24.push(ray[field]["2024"]);
      }
    }
    const indLabel = field === "units" ? theme.unit_label : theme.child_label;
    return barConfig(indLabel + titleSuffix, labels, yearMode, d23, d24, theme.years, unit);
  }

  function buildVed1Chart(theme, metric, yearMode, level, unit) {
    const scale = 1 / 1_000_000;
    const labels = [];
    const series = { 2023: [], 2024: [], 2025: [] };
    const names = { turnover: "Оборот", export: "Экспорт", import: "Импорт" };
    const title = names[metric] || metric;
    let titleSuffix = "";

    if (level === "kr") {
      labels.push(theme.data.KR.display);
      ["2023", "2024", "2025"].forEach((y) => {
        series[y].push((theme.data.KR.years[Number(y)]?.[metric] || 0) * scale);
      });
    } else if (level === "oblast") {
      const obKey = el("f-oblast").value;
      if (obKey === OBLAST_ALL) {
        Object.keys(theme.data)
          .filter((k) => k !== "KR")
          .sort()
          .forEach((k) => {
            labels.push(theme.data[k].display);
            ["2023", "2024", "2025"].forEach((y) => {
              series[y].push((theme.data[k].years[Number(y)]?.[metric] || 0) * scale);
            });
          });
      } else {
        const node = theme.data[obKey];
        titleSuffix = node ? ` · ${node.display}` : "";
        labels.push(node.display);
        ["2023", "2024", "2025"].forEach((y) => {
          series[y].push((node.years[Number(y)]?.[metric] || 0) * scale);
        });
      }
    } else if (level === "rayon") {
      labels.push("—");
      series["2023"].push(0);
      series["2024"].push(0);
      series["2025"].push(0);
    }

    const fullTitle = title + titleSuffix;
    if (yearMode === "2025") {
      return singleBar(fullTitle, labels, series["2025"], CHART.gold, unit);
    }
    if (yearMode === "2023") {
      return singleBar(fullTitle, labels, series["2023"], CHART.teal, unit);
    }
    if (yearMode === "2024") {
      return singleBar(fullTitle, labels, series["2024"], CHART.blue, unit);
    }
    return barConfig(fullTitle, labels, "compare", series["2023"], series["2024"], ["2023", "2024"], unit);
  }

  function buildSimpleChart(theme, rowIdx, yearMode, unit) {
    const row = theme.data.rows[rowIdx];
    const u = unit || row.unit;
    return barConfig(row.label, [theme.title], yearMode, [row["2023"]], [row["2024"]], ["2023", "2024"], u);
  }

  function buildEgrChart(block) {
    const egrUnit = block.egr_unit || "ед.";
    const level = el("f-level").value;
    const mode = el("f-indicator").value;
    const obKey = el("f-oblast").value;

    if (mode === "total" && level === "kr") {
      const obs = Object.values(block.data.nodes).filter((n) => n.level === "oblast");
      return singleBar(
        "Итого по областям",
        obs.map((o) => o.display),
        obs.map((o) => o.total || 0),
        CHART.blue,
        egrUnit
      );
    }

    if (mode === "total" && level === "oblast") {
      if (obKey === OBLAST_ALL) {
        const obs = Object.values(block.data.nodes).filter((n) => n.level === "oblast");
        return singleBar(
          "Итого по областям",
          obs.map((o) => o.display),
          obs.map((o) => o.total || 0),
          CHART.blue,
          egrUnit
        );
      }
      const ob = block.data.nodes[obKey];
      const labels = [];
      const vals = [];
      Object.keys(ob?.rayons || {}).forEach((rid) => {
        const r = block.data.nodes[rid];
        if (!r) return;
        labels.push(r.display);
        vals.push(r.total || 0);
      });
      const t = ob ? `Итого · ${ob.display}` : "Итого";
      return singleBar(t, labels, vals, CHART.teal, egrUnit);
    }

    let node;
    if (level === "kr") node = block.data.nodes.KR;
    else if (level === "rayon") node = block.data.nodes[el("f-rayon").value];
    else if (obKey !== OBLAST_ALL) node = block.data.nodes[obKey];

    if (!node) {
      return singleBar("Нет данных", ["—"], [0], CHART.teal, egrUnit);
    }

    const acts = node.activities || [];
    return singleBar(
      node.display,
      acts.map((a) => a.code),
      acts.map((a) => a.value),
      CHART.teal,
      egrUnit
    );
  }

  function barConfig(title, labels, yearMode, d23, d24, yearLabels, unit) {
    const yL = yearLabels || ["2023", "2024"];
    const head = chartHeading(title, unit);
    if (yearMode === "2023") {
      return singleBar(title, labels, d23, CHART.teal, unit, yL[0]);
    }
    if (yearMode === "2024") {
      return singleBar(title, labels, d24, CHART.gold, unit, yL[1] || "2024");
    }
    return {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: unit ? `${yL[0]}, ${unit}` : yL[0],
            data: d23,
            backgroundColor: CHART.teal,
          },
          {
            label: unit ? `${yL[1] || "2024"}, ${unit}` : yL[1] || "2024",
            data: d24,
            backgroundColor: CHART.gold,
          },
        ],
      },
      options: chartOptions(head, unit),
    };
  }

  function singleBar(title, labels, data, color, unit, yearTag) {
    const head = yearTag ? chartHeading(`${title} · ${yearTag}`, unit) : chartHeading(title, unit);
    return {
      type: "bar",
      data: {
        labels,
        datasets: [{ label: head, data, backgroundColor: color }],
      },
      options: chartOptions(head, unit),
    };
  }

  function chartOptions(title, unit) {
    const tick = "#4a5578";
    const grid = "#d8dff0";
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: { display: true, text: title, font: { size: 14 }, color: "#1e2640" },
        legend: { position: "bottom", labels: { color: tick } },
      },
      scales: {
        x: { ticks: { color: tick }, grid: { color: grid } },
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: unit ? `Значение, ${unit}` : "Значение",
            color: tick,
          },
          ticks: { color: tick },
          grid: { color: grid },
        },
      },
    };
  }

  initPage();
})();

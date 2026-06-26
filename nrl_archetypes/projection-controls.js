(function () {
  const state = {
    activeYearIndex: 0,
    droppedDimension: null,
    originalData: null,
  };

  function getGraph() {
    return document.querySelector(".plotly-graph-div");
  }

  function readArray(value) {
    if (!value) return [];
    if (ArrayBuffer.isView(value)) return Array.from(value);
    return Array.isArray(value) ? value.slice() : value;
  }

  function getSceneTitle(gd, axis, fallback) {
    const title = gd && gd.layout && gd.layout.scene && gd.layout.scene[axis] && gd.layout.scene[axis].title;
    if (typeof title === "string") return title;
    return title && title.text ? title.text : fallback;
  }

  function getDimensions(gd) {
    return [
      { key: "pc1", axis: "x", sceneAxis: "xaxis", label: getSceneTitle(gd, "xaxis", "Dimension 1") },
      { key: "pc2", axis: "y", sceneAxis: "yaxis", label: getSceneTitle(gd, "yaxis", "Dimension 2") },
      { key: "pc3", axis: "z", sceneAxis: "zaxis", label: getSceneTitle(gd, "zaxis", "Dimension 3") },
    ];
  }

  function ensureOriginalData(gd) {
    if (state.originalData) return true;
    if (!gd || !gd.data || !gd.data.length) return false;

    const firstTrace = gd.data[0];
    if (!firstTrace || !firstTrace.x || !firstTrace.y || !firstTrace.z) return false;

    state.originalData = gd.data.map((trace) => ({
      x: readArray(trace.x),
      y: readArray(trace.y),
      z: readArray(trace.z),
    }));

    return true;
  }

  function getProjectionTrace(trace, index, keptDimensions) {
    const nextTrace = { ...trace };
    const source = state.originalData[index];

    delete nextTrace.scene;
    delete nextTrace.z;
    nextTrace.type = "scatter";
    nextTrace.mode = trace.mode || "markers";
    nextTrace.x = source[keptDimensions[0].axis];
    nextTrace.y = source[keptDimensions[1].axis];
    nextTrace.marker = { ...(trace.marker || {}) };

    return nextTrace;
  }

  function getRestoredTrace(trace, index) {
    const nextTrace = { ...trace };
    const source = state.originalData[index];

    delete nextTrace.xaxis;
    delete nextTrace.yaxis;
    nextTrace.type = "scatter3d";
    nextTrace.mode = trace.mode || "markers";
    nextTrace.x = source.x;
    nextTrace.y = source.y;
    nextTrace.z = source.z;
    nextTrace.marker = { ...(trace.marker || {}) };

    return nextTrace;
  }

  function getProjectedAxis(label) {
    return {
      title: { text: label, font: { color: "#f8fafc", size: 15 } },
      tickfont: { color: "#f8fafc", size: 12 },
      showline: false,
      mirror: false,
      zeroline: true,
      zerolinecolor: "rgba(229, 231, 235, 0.82)",
      zerolinewidth: 2,
      showgrid: true,
      gridcolor: "rgba(229, 231, 235, 0.28)",
      gridwidth: 1,
      ticks: "",
    };
  }

  function applyProjection() {
    const gd = getGraph();
    if (!gd || !window.Plotly) return;

    if (!ensureOriginalData(gd)) return;

    const dimensions = getDimensions(gd);
    const keptDimensions = dimensions.filter((dimension) => dimension.key !== state.droppedDimension);
    const data = gd.data.map((trace, index) => (
      state.droppedDimension
        ? getProjectionTrace(trace, index, keptDimensions)
        : getRestoredTrace(trace, index)
    ));
    const baseMargin = gd.layout.margin || {};
    const layout = {
      ...gd.layout,
      margin: state.droppedDimension
        ? { ...baseMargin, t: Math.max(baseMargin.t || 0, 82), r: Math.max(baseMargin.r || 0, 64) }
        : { ...baseMargin },
      legend: { ...(gd.layout.legend || {}) },
      scene: {
        ...(gd.layout.scene || {}),
        xaxis: { ...((gd.layout.scene || {}).xaxis || {}), title: { text: dimensions[0].label }, showspikes: false },
        yaxis: { ...((gd.layout.scene || {}).yaxis || {}), title: { text: dimensions[1].label }, showspikes: false },
        zaxis: { ...((gd.layout.scene || {}).zaxis || {}), title: { text: dimensions[2].label }, showspikes: false },
        dragmode: "turntable",
      },
      xaxis: state.droppedDimension
        ? getProjectedAxis(keptDimensions[0].label)
        : gd.layout.xaxis,
      yaxis: state.droppedDimension
        ? { ...getProjectedAxis(keptDimensions[1].label), scaleanchor: "x", scaleratio: 1 }
        : gd.layout.yaxis,
      dragmode: state.droppedDimension ? "pan" : gd.layout.dragmode,
    };

    Plotly.react(gd, data, layout, {
      responsive: true,
      scrollZoom: true,
      displaylogo: false,
    }).then(() => {
      updateProjectionAttributes();
      renderYearControls();
      if (typeof window.applyButtonStyles === "function") window.applyButtonStyles();
      if (typeof window.adjustPlotlyForMobile === "function") window.adjustPlotlyForMobile();
    });
  }

  function updateProjectionAttributes() {
    const wrapper = document.getElementById("plotly-wrapper");
    if (!wrapper) return;

    wrapper.dataset.projectionMode = state.droppedDimension ? "2d" : "3d";
    wrapper.dataset.droppedDimension = state.droppedDimension || "";
    wrapper.dataset.projectionReady = state.originalData ? "true" : "false";
  }

  function updateButtons(activeButton, dimensionKey) {
    document.querySelectorAll(".dimension-toggle-btn").forEach((button) => {
      const isDropped = button === activeButton && state.droppedDimension === dimensionKey;
      button.classList.toggle("is-dropped", isDropped);
      button.setAttribute("aria-pressed", isDropped ? "true" : "false");
      button.textContent = isDropped ? `Restore ${button.dataset.dimensionLabel}` : `- Drop ${button.dataset.dimensionLabel}`;
    });
  }

  function updateYearButtons() {
    document.querySelectorAll(".year-toggle-btn").forEach((button, index) => {
      const isActive = index === state.activeYearIndex;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  function applyYearFilter(index, yearButton) {
    const gd = getGraph();
    if (!gd || !window.Plotly || !yearButton) return;

    state.activeYearIndex = index;
    updateYearButtons();

    const args = yearButton.args || [];
    Plotly.update(gd, args[0] || {}, args[1] || {}).then(() => {
      if (state.droppedDimension) applyProjection();
    });
  }

  function renderYearControls() {
    const wrapper = document.getElementById("plotly-wrapper");
    const gd = getGraph();
    if (!wrapper || !gd || wrapper.querySelector("#year-toggle")) return;

    const yearMenu = gd.layout && gd.layout.updatemenus && gd.layout.updatemenus[0];
    if (!yearMenu || !Array.isArray(yearMenu.buttons) || !yearMenu.buttons.length) return;

    const controls = document.createElement("div");
    controls.id = "year-toggle";

    yearMenu.buttons.forEach((yearButton, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "year-toggle-btn";
      button.textContent = yearButton.label;
      button.setAttribute("aria-pressed", index === state.activeYearIndex ? "true" : "false");
      button.addEventListener("click", () => applyYearFilter(index, yearButton));
      controls.appendChild(button);
    });

    wrapper.appendChild(controls);
    updateYearButtons();
  }

  function renderControls() {
    const wrapper = document.getElementById("plotly-wrapper");
    const gd = getGraph();
    if (!wrapper || !gd) return;

    if (!ensureOriginalData(gd)) return;
    updateProjectionAttributes();
    renderYearControls();

    if (wrapper.querySelector("#dimension-toggle")) return;

    const controls = document.createElement("div");
    controls.id = "dimension-toggle";

    getDimensions(gd).forEach((dimension) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "dimension-toggle-btn";
      button.dataset.dimensionLabel = dimension.label;
      button.textContent = "- Drop " + dimension.label;
      button.title = "Drop " + dimension.label + " from the plot";
      button.setAttribute("aria-pressed", "false");
      button.addEventListener("click", () => {
        state.droppedDimension = state.droppedDimension === dimension.key ? null : dimension.key;
        updateButtons(button, dimension.key);
        applyProjection();
      });
      controls.appendChild(button);
    });

    wrapper.appendChild(controls);
  }

  function injectStyles() {
    if (document.getElementById("projection-control-styles")) return;

    const style = document.createElement("style");
    style.id = "projection-control-styles";
    style.textContent = `
      body { margin: 0; }
      #plotly-wrapper { position: relative; }
      #plotly-wrapper .updatemenu-container {
        display: none !important;
      }
      #year-toggle {
        position: absolute;
        top: 10px;
        left: 50%;
        z-index: 22;
        display: flex;
        max-width: calc(100% - 80px);
        overflow: hidden;
        border: 1px solid rgba(148, 163, 184, 0.34);
        border-radius: 999px;
        background: rgba(9, 14, 30, 0.78);
        box-shadow: 0 10px 26px rgba(4, 8, 18, 0.28);
        transform: translateX(-50%);
        backdrop-filter: blur(10px);
      }
      .year-toggle-btn {
        appearance: none;
        min-height: 34px;
        border: 0;
        border-right: 1px solid rgba(148, 163, 184, 0.22);
        background: rgba(17, 24, 46, 0.96);
        color: rgba(245, 247, 255, 0.84);
        cursor: pointer;
        font: 800 13px/1 "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
        padding: 0 14px;
        white-space: nowrap;
        transition: background 0.18s ease, color 0.18s ease;
      }
      .year-toggle-btn:last-child {
        border-right: 0;
      }
      .year-toggle-btn:hover,
      .year-toggle-btn:focus-visible {
        background: rgba(0, 245, 138, 0.1);
        color: #00f58a;
        outline: none;
      }
      .year-toggle-btn.is-active {
        background: rgba(0, 245, 138, 0.2);
        color: #00f58a;
      }
      #dimension-toggle {
        position: absolute;
        top: 58px;
        left: 10px;
        z-index: 20;
        display: flex;
        gap: 6px;
        flex-wrap: nowrap;
        max-width: calc(100% - 90px);
        padding: 5px;
        background: rgba(9, 14, 30, 0.76);
        border: 1px solid rgba(148, 163, 184, 0.28);
        border-radius: 999px;
        box-shadow: 0 10px 26px rgba(4, 8, 18, 0.28);
        backdrop-filter: blur(10px);
      }
      .dimension-toggle-btn {
        appearance: none;
        min-height: 26px;
        border: 1px solid rgba(148, 163, 184, 0.36);
        border-radius: 999px;
        background: rgba(17, 24, 46, 0.94);
        color: #f8fafc;
        cursor: pointer;
        font: 800 9px/1.1 "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
        letter-spacing: 0.02em;
        padding: 5px 9px;
        white-space: nowrap;
        transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease, transform 0.18s ease;
      }
      .dimension-toggle-btn:hover,
      .dimension-toggle-btn:focus-visible {
        border-color: #C9FF00;
        background: rgba(201, 255, 0, 0.09);
        color: #C9FF00;
        outline: none;
      }
      .dimension-toggle-btn:hover {
        transform: translateY(-1px);
      }
      .dimension-toggle-btn.is-dropped {
        background: rgba(201, 255, 0, 0.18);
        border-color: #C9FF00;
        color: #C9FF00;
        box-shadow: inset 0 0 0 1px rgba(201, 255, 0, 0.16);
      }
      @media (max-width: 768px) {
        #year-toggle {
          left: 6px;
          max-width: calc(100% - 12px);
          transform: none;
        }
        .year-toggle-btn {
          min-height: 32px;
          padding: 0 10px;
          font-size: 11px;
        }
        #dimension-toggle {
          top: 52px;
          left: 6px;
          max-width: calc(100% - 64px);
        }
        .dimension-toggle-btn {
          flex: 1 1 auto;
          min-width: 0;
          padding: 5px 6px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function init() {
    injectStyles();
    renderControls();
    setTimeout(renderControls, 100);
    setTimeout(renderControls, 500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

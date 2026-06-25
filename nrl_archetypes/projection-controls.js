(function () {
  const state = {
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
      button.classList.toggle("is-dropped", button === activeButton && state.droppedDimension === dimensionKey);
    });
  }

  function renderControls() {
    const wrapper = document.getElementById("plotly-wrapper");
    const gd = getGraph();
    if (!wrapper || !gd || wrapper.querySelector("#dimension-toggle")) return;

    if (!ensureOriginalData(gd)) return;
    updateProjectionAttributes();

    const controls = document.createElement("div");
    controls.id = "dimension-toggle";

    getDimensions(gd).forEach((dimension) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "dimension-toggle-btn";
      button.textContent = dimension.label;
      button.title = "Toggle " + dimension.label + " projection";
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
      #dimension-toggle {
        position: absolute;
        top: 44px;
        left: 10px;
        z-index: 20;
        display: flex;
        gap: 4px;
        flex-wrap: nowrap;
        max-width: calc(100% - 90px);
        padding: 3px;
        background: rgba(10, 17, 40, 0.74);
        border: 1px solid rgba(248, 250, 252, 0.24);
        border-radius: 6px;
        box-shadow: 0 2px 8px rgba(10, 17, 40, 0.22);
      }
      .dimension-toggle-btn {
        appearance: none;
        border: 1px solid rgba(248, 250, 252, 0.34);
        border-radius: 4px;
        background: rgba(15, 23, 42, 0.92);
        color: #f8fafc;
        cursor: pointer;
        font: 700 9px/1.1 "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
        padding: 3px 6px;
        white-space: nowrap;
      }
      .dimension-toggle-btn:hover,
      .dimension-toggle-btn:focus-visible {
        border-color: #C9FF00;
        outline: none;
      }
      .dimension-toggle-btn.is-dropped {
        background: rgba(201, 255, 0, 0.14);
        border-color: #C9FF00;
        color: #ffffff;
      }
      @media (max-width: 768px) {
        #dimension-toggle {
          top: 48px;
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

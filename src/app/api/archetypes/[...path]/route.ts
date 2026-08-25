import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { isValidArchetypesCupToken } from "@/lib/access/archetypes-cup-token";
import { getServerProPlotAccess } from "@/lib/access/pro-access-server";
import { fetchCupPlayerLeagues } from "@/lib/supabase/queries";

export const dynamic = "force-dynamic";

const ARCHETYPES_DIR = path.join(process.cwd(), "nrl_archetypes");

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const APP_FONT_STACK = "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
const ARCHETYPES_ARTICLE_TITLE = "NRL Archetypes: Understanding Player Roles Beyond Position";
const ARCHETYPES_ARTICLE_SLUG = "nrl-archetypes-understanding-player-roles-beyond-position";
const ARTICLES_PATH = "/dashboard/articles";

interface ArchetypesArticleLink {
  href: string;
  imageUrls: string[];
  title: string;
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function getArchetypesArticleLink(): ArchetypesArticleLink {
  return {
    href: `${ARTICLES_PATH}/${ARCHETYPES_ARTICLE_SLUG}`,
    imageUrls: [],
    title: ARCHETYPES_ARTICLE_TITLE,
  };
}

function buildArchetypesArticleLink(articleLink: ArchetypesArticleLink): string {
  const media = articleLink.imageUrls.length > 0
    ? `
            <span class="article-link-media ${articleLink.imageUrls.length > 1 ? "is-split" : ""}" aria-hidden="true">
                ${articleLink.imageUrls
                  .map((url) => `
                <span class="article-link-image-wrap">
                    <img src="${escapeAttribute(url)}" alt="" loading="lazy" decoding="async" />
                </span>`)
                  .join("")}
            </span>`
    : "";

  return `
        <a
            class="article-link-card"
            href="${escapeAttribute(articleLink.href)}"
            target="_top"
            aria-label="Read ${escapeAttribute(articleLink.title)}"
        >
            ${media}
            <span class="article-link-bg" aria-hidden="true"></span>
            <span class="article-link-content">
                <span class="article-link-copy">
                    <span class="article-link-eyebrow">Article</span>
                    <span class="article-link-title">${escapeAttribute(articleLink.title)}</span>
                </span>
                <span class="article-link-arrow" aria-hidden="true">→</span>
            </span>
        </a>`;
}

interface ArchetypesRouteContext {
  params: Promise<{
    path?: string[];
  }>;
}

function resolveArchetypePath(parts: string[] | undefined): string | null {
  const requestedPath = parts && parts.length > 0 ? parts.join("/") : "index.html";
  const resolvedPath = path.resolve(ARCHETYPES_DIR, requestedPath);
  const relativePath = path.relative(ARCHETYPES_DIR, resolvedPath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return null;
  }

  return resolvedPath;
}

function isCupArchetypeAsset(filePath: string): boolean {
  return path.basename(filePath).startsWith("cup_");
}

function gateCupIndexAssets(html: string): string {
  return html
    .replaceAll(/\s*<script src="cup_[^"]+"><\/script>/g, "")
    .replace(
      '<button class="mode-btn" data-competition="cup">Cup</button>',
      '<button class="mode-btn" data-competition="cup" disabled title="Cup archetypes require Pro or Premium access">Cup</button>'
    );
}

function styleIndexHtml(
  html: string,
  articleLink: ArchetypesArticleLink,
  canAccessCup: boolean,
  cupAccessToken: string | null
): string {
  const cupAccessQuery = cupAccessToken ? `?cupAccess=${encodeURIComponent(cupAccessToken)}` : "";
  const cupReadyHtml = canAccessCup
    ? html
      .replaceAll(/src="(cup_[^"]+)"/g, `src="$1${cupAccessQuery}"`)
      .replaceAll("nextFrame.src = plotFile;", "nextFrame.src = withCupAccess(plotFile);")
      .replaceAll("fetch(plotFile)", "fetch(withCupAccess(plotFile))")
    : gateCupIndexAssets(html);

  return cupReadyHtml
    .replaceAll("--navy: #0A1128;", "--navy: #0b1020;")
    .replaceAll("--lime: #C9FF00;", "--lime: #00f58a;")
    .replaceAll("--white: #FFFFFF;", "--white: #f5f7ff;")
    .replaceAll("--gray: #1E2742;", "--gray: #1e2542;")
    .replaceAll("--card-bg: #151E3F;", "--card-bg: #161c32;")
    .replaceAll("--border-color: #2A3B6E;", "--border-color: #2a3356;")
    .replace(
      /<div class="ml-explanation" id="mlDropdown">[\s\S]*?<\/div>\s*(?=<div class="controls-row">|<div class="control-frame">|<div class="mode-toggle" id="modeToggle">|<div class="tabs" id="positionTabs">)/,
      buildArchetypesArticleLink(articleLink)
    )
    .replace(
      "</style>",
      `
        html,
        body {
            font-family: ${APP_FONT_STACK};
        }

        html {
            background-color: #111733 !important;
            background-repeat: no-repeat !important;
        }

        body {
            background-color: #111733 !important;
            background-repeat: no-repeat !important;
        }

        body::before,
        body::after {
            display: none !important;
        }

        body *,
        button {
            font-family: inherit !important;
        }

        header {
            display: none;
        }

        h1 {
            font-size: 1.75rem;
            font-weight: 700;
            letter-spacing: 0;
            text-transform: none;
        }

        h1 span {
            font-weight: 700;
        }

        .container {
            background: transparent;
            max-width: 100%;
            padding: 1.5rem 0 2rem;
        }

        .mode-toggle {
            gap: 1rem;
        }

        .mode-btn,
        .tab-btn,
        .year-btn {
            border-radius: 999px;
            letter-spacing: 0.14em;
        }

        .mode-btn,
        .tab-btn {
            padding: 0.38rem 0.68rem;
            font-size: 0.68rem;
            font-weight: 800;
            text-transform: uppercase;
            background-color: transparent;
        }

        .control-frame {
            gap: 0.2rem;
            padding: 0.18rem;
        }

        .control-frame .mode-btn {
            padding: 0.34rem 0.58rem;
            font-size: 0.62rem;
            letter-spacing: 0.1em;
        }

        .control-divider {
            height: 1.15rem;
        }

        #modeToggle,
        #competitionToggle + .control-divider {
            display: none;
        }

        .cup-league-filter {
            display: none;
            height: 1.9rem;
            min-width: 6.3rem;
            border: 1px solid #2a3356;
            border-radius: 999px;
            background: #111733;
            color: #f5f7ff;
            padding: 0 0.65rem;
            font: 700 0.6rem ${APP_FONT_STACK};
            letter-spacing: 0.08em;
            text-transform: uppercase;
        }

        .cup-league-filter.is-visible {
            display: block;
        }

        .control-frame.has-cup-league-filter {
            gap: 0.65rem;
            overflow: visible;
            border: 0;
            border-radius: 0;
            background: transparent;
            padding: 0;
        }

        .control-frame.has-cup-league-filter > .mode-toggle {
            border: 1px solid #2a3356;
            border-radius: 999px;
            background: rgba(17, 24, 50, 0.72);
            padding: 0.18rem;
        }

        .control-frame.has-cup-league-filter > .control-divider {
            display: none;
        }

        .tabs {
            gap: 0.4rem;
            margin-bottom: 1rem;
        }

        .mode-btn.active,
        .tab-btn.active,
        .year-btn.active {
            background-color: rgba(0, 245, 138, 0.14);
            color: #00f58a;
            border-color: #00f58a;
        }

        .mode-btn:hover,
        .tab-btn:hover,
        .year-btn:hover {
            background-color: rgba(0, 245, 138, 0.08);
        }

        @media (max-width: 768px) {
            html,
            body {
                min-height: 100dvh;
            }

            .tabs {
                gap: 0.32rem;
            }

            .mode-btn,
            .tab-btn {
                padding: 0.32rem 0.56rem;
                font-size: 0.6rem;
            }

            .control-frame .mode-btn {
                padding: 0.3rem 0.5rem;
                font-size: 0.58rem;
            }
        }

        .plot-container,
        .archetype-card,
        .ml-explanation {
            box-shadow: 0 18px 60px rgba(0, 0, 0, 0.22);
        }

        .plot-container {
            background: transparent;
            border: 0;
            border-radius: 0;
            box-shadow: none;
        }

        .plot-container iframe {
            position: absolute;
            inset: 0;
            display: block;
            background: #111733 !important;
            color-scheme: dark;
            opacity: 0;
            transition: opacity 120ms ease-out;
        }

        .plot-container iframe.is-ready {
            opacity: 1;
        }

        .description,
        .ml-section p {
            color: #c7d0e6;
        }

        .article-link-card {
            position: relative;
            display: flex;
            min-height: 58px;
            width: 100%;
            overflow: hidden;
            border: 1px solid rgba(123, 92, 255, 0.22);
            border-radius: 999px;
            background: rgba(32, 40, 74, 0.8);
            color: #fff;
            text-decoration: none;
            box-shadow: 0 8px 18px rgba(8, 10, 18, 0.16);
            transition: border-color 0.18s ease;
            margin-bottom: 1.25rem;
        }

        .article-link-card:hover {
            border-color: rgba(0, 245, 138, 0.55);
        }

        .article-link-bg {
            position: absolute;
            inset: 0;
            background:
                linear-gradient(90deg, rgba(14, 19, 48, 0.92), rgba(14, 19, 48, 0.78), rgba(14, 19, 48, 0.56)),
                radial-gradient(circle at 20% 30%, rgba(0, 245, 138, 0.18), transparent 26%),
                radial-gradient(circle at 78% 45%, rgba(123, 92, 255, 0.22), transparent 32%),
                #20284a;
        }

        .article-link-media {
            position: absolute;
            inset: 0;
            display: grid;
            grid-template-columns: 1fr;
        }

        .article-link-media.is-split {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .article-link-image-wrap {
            min-width: 0;
            overflow: hidden;
        }

        .article-link-image-wrap img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            opacity: 0.45;
            transition: transform 0.3s ease;
        }

        .article-link-card:hover .article-link-image-wrap img {
            transform: scale(1.03);
        }

        .article-link-content {
            position: relative;
            display: flex;
            min-height: 58px;
            width: 100%;
            align-items: center;
            justify-content: space-between;
            gap: 0.75rem;
            padding: 0.55rem 1rem;
        }

        .article-link-copy {
            min-width: 0;
        }

        .article-link-eyebrow,
        .article-link-title {
            display: block;
            text-transform: uppercase;
        }

        .article-link-eyebrow {
            color: rgba(0, 245, 138, 0.8);
            font-size: 8px;
            font-weight: 700;
            letter-spacing: 0.18em;
            line-height: 1;
        }

        .article-link-title {
            margin-top: 0.25rem;
            color: rgba(255, 255, 255, 0.86);
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 0.08em;
            line-height: 1.25;
        }

        .article-link-arrow {
            display: grid;
            width: 1.5rem;
            height: 1.5rem;
            flex-shrink: 0;
            place-items: center;
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 999px;
            background: rgba(30, 37, 66, 0.72);
            color: rgba(245, 247, 255, 0.85);
            font-size: 0.9rem;
            line-height: 1;
        }
    </style>
    <script>
        const archetypesCupAccessQuery = ${JSON.stringify(cupAccessQuery)};
        let cupPlayerLeagues = null;
        function withCupAccess(assetPath) {
            if (!archetypesCupAccessQuery || !assetPath.startsWith('cup_')) return assetPath;
            return assetPath + archetypesCupAccessQuery;
        }

        function getCupPlayerName(label) {
            return String(label || '')
                .replace(/\\s+\\(\\d{4}\\)\\s*$/, '')
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, ' ')
                .trim();
        }

        function plotValues(value) {
            if (Array.isArray(value)) return value.slice();
            if (ArrayBuffer.isView(value)) return Array.from(value);
            if (value && typeof value === 'object' && typeof value.bdata === 'string') {
                const binary = window.atob(value.bdata);
                const bytes = new Uint8Array(binary.length);
                for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
                const constructors = { f8: Float64Array, f4: Float32Array, i1: Int8Array, i2: Int16Array, i4: Int32Array, u1: Uint8Array, u2: Uint16Array, u4: Uint32Array };
                const TypedArray = constructors[value.dtype];
                return TypedArray ? Array.from(new TypedArray(bytes.buffer)) : [];
            }
            return [];
        }

        function applyCupLeagueFilter() {
            const selectedLeague = document.getElementById('cupLeagueFilter')?.value || 'all';
            if (currentCompetition !== 'cup' || !cupPlayerLeagues) return;

            document.querySelectorAll('#plotContainer iframe').forEach(function (frame) {
                const graph = frame.contentDocument?.querySelector('.plotly-graph-div');
                const plotly = frame.contentWindow?.Plotly;
                if (!graph || !plotly || !Array.isArray(graph.data)) return;

                if (!frame.__cupLeagueSource) {
                    frame.__cupLeagueSource = graph.data.map(function (trace) {
                        return {
                            name: trace.name,
                            x: plotValues(trace.x),
                            y: plotValues(trace.y),
                            z: plotValues(trace.z),
                            hovertext: plotValues(trace.hovertext),
                        };
                    });
                }

                const source = frame.__cupLeagueSource;
                const filtered = source.map(function (trace) {
                    const keep = trace.hovertext.map(function (label) {
                        return selectedLeague === 'all' || cupPlayerLeagues[getCupPlayerName(label)] === selectedLeague;
                    });
                    return {
                        ...trace,
                        keep,
                        hasPoints: keep.some(Boolean),
                    };
                });
                const legendTraceIndexes = new Set();
                filtered.forEach(function (trace, index) {
                    if (trace.hasPoints && !Array.from(legendTraceIndexes).some(function (traceIndex) {
                        return filtered[traceIndex].name === trace.name;
                    })) {
                        legendTraceIndexes.add(index);
                    }
                });
                const update = { x: [], y: [], z: [], hovertext: [], visible: [], showlegend: [] };
                const traceIndexes = source.map(function (_, index) { return index; });

                filtered.forEach(function (trace, index) {
                    update.x.push(trace.x.filter(function (_, pointIndex) { return trace.keep[pointIndex]; }));
                    update.y.push(trace.y.filter(function (_, pointIndex) { return trace.keep[pointIndex]; }));
                    update.z.push(trace.z.filter(function (_, pointIndex) { return trace.keep[pointIndex]; }));
                    update.hovertext.push(trace.hovertext.filter(function (_, pointIndex) { return trace.keep[pointIndex]; }));
                    update.visible.push(trace.hasPoints);
                    update.showlegend.push(legendTraceIndexes.has(index));
                });
                plotly.restyle(graph, update, traceIndexes);
            });
        }

        function syncCupLeagueFilter() {
            document.getElementById('cupLeagueFilter')?.classList.toggle('is-visible', currentCompetition === 'cup');
        }

        document.addEventListener('DOMContentLoaded', function () {
            const select = document.createElement('select');
            select.id = 'cupLeagueFilter';
            select.className = 'cup-league-filter';
            select.setAttribute('aria-label', 'Cup competition');
            select.innerHTML = '<option value="all">All Cup</option><option value="nsw">NSW Cup</option><option value="qld">QLD Cup</option>';
            document.getElementById('windowToggle')?.insertAdjacentElement('afterend', select);
            select.parentElement?.classList.add('has-cup-league-filter');
            select.addEventListener('change', applyCupLeagueFilter);
            document.getElementById('competitionToggle')?.addEventListener('click', function () {
                window.setTimeout(function () {
                    syncCupLeagueFilter();
                    applyCupLeagueFilter();
                }, 0);
            });
            document.addEventListener('load', function (event) {
                if (event.target instanceof HTMLIFrameElement && event.target.closest('#plotContainer')) {
                    window.setTimeout(applyCupLeagueFilter, 0);
                }
            }, true);
            fetch('cup-player-leagues.json' + archetypesCupAccessQuery)
                .then(function (response) { return response.ok ? response.json() : null; })
                .then(function (leagues) {
                    cupPlayerLeagues = leagues;
                    applyCupLeagueFilter();
                })
                .catch(function () { cupPlayerLeagues = null; });
            syncCupLeagueFilter();
        });

        function syncArchetypesBackground() {
            try {
                if (window.parent === window || !window.frameElement) return;
                const parentBodyStyle = window.parent.getComputedStyle(window.parent.document.body);
                const frameRect = window.frameElement.getBoundingClientRect();
                [document.documentElement, document.body].filter(Boolean).forEach(function (layer) {
                    layer.style.setProperty('background-color', parentBodyStyle.backgroundColor, 'important');
                    layer.style.setProperty('background-image', parentBodyStyle.backgroundImage, 'important');
                    layer.style.setProperty('background-size', window.parent.innerWidth + 'px ' + window.parent.innerHeight + 'px', 'important');
                    layer.style.setProperty('background-position', (-frameRect.left) + 'px ' + (-frameRect.top) + 'px', 'important');
                    layer.style.setProperty('background-repeat', 'no-repeat', 'important');
                    layer.style.setProperty('background-attachment', 'fixed', 'important');
                });
            } catch (_) {
                document.documentElement.style.setProperty('background-color', '#111733', 'important');
            }
        }
        syncArchetypesBackground();
        document.addEventListener('DOMContentLoaded', syncArchetypesBackground, { once: true });
        window.addEventListener('resize', syncArchetypesBackground, { passive: true });
        window.parent.addEventListener('scroll', syncArchetypesBackground, { passive: true });
        document.addEventListener('load', function (event) {
            const frame = event.target;
            if (!(frame instanceof HTMLIFrameElement) || !frame.closest('.plot-container')) return;
            frame.style.opacity = '0.99';
            frame.style.transform = 'translateZ(0)';
            window.requestAnimationFrame(function () {
                window.requestAnimationFrame(function () {
                    frame.style.opacity = '1';
                    frame.style.transform = 'none';
                });
            });
        }, true);
    </script>
    `
    );
}

function stylePlotHtml(html: string): string {
  const controlsVersion = Date.now();
  const controlsScript = `<script src="projection-controls.js?v=${controlsVersion}"></script>`;
  const htmlWithControls = html.includes("projection-controls.js")
    ? html.replaceAll(/src="projection-controls\.js(?:\?v=\d+)?"/g, `src="projection-controls.js?v=${controlsVersion}"`)
    : html.replace("</body>", `${controlsScript}</body>`);

  return htmlWithControls
    .replaceAll("#C9FF00", "#00f58a")
    .replaceAll("#c9ff00", "#00f58a")
    .replaceAll("#0A1128", "#0b1020")
    .replaceAll("#151E3F", "#161c32")
    .replaceAll("#1E2742", "#1e2542")
    .replaceAll("#2A3B6E", "#2a3356")
    .replaceAll("#f0f0f0", "#111733")
    .replaceAll("#E5ECF6", "#1e2542")
    .replaceAll('"paper_bgcolor":"#111733"', '"paper_bgcolor":"rgba(0,0,0,0)"')
    .replaceAll('"plot_bgcolor":"#111733"', '"plot_bgcolor":"rgba(0,0,0,0)"')
    .replaceAll("#2a3f5f", "#f5f7ff")
    .replaceAll('"gridcolor":"white"', '"gridcolor":"rgba(245,247,255,0.14)"')
    .replaceAll('"zerolinecolor":"white"', '"zerolinecolor":"rgba(245,247,255,0.18)"')
    .replaceAll('"gridwidth":2', '"gridwidth":1')
    .replaceAll('"opacity":0.8,"size":5', '"opacity":0.82,"size":3.5')
    .replaceAll("'marker.size': 6", "'marker.size': 4")
    .replaceAll("rect.style.fill = 'white';", "rect.style.fill = parentGroup && parentGroup.classList.contains('active') ? 'rgba(0, 245, 138, 0.18)' : 'rgba(17, 24, 46, 0.96)';")
    .replaceAll("text.style.fill = 'black';", "text.style.fill = '#00f58a';")
    .replaceAll("text.setAttribute('fill', 'black');", "text.setAttribute('fill', '#00f58a');")
    .replaceAll("text.style.fill = '#0b1020';", "text.style.fill = 'rgba(245, 247, 255, 0.88)';")
    .replaceAll("text.setAttribute('fill', '#0b1020');", "text.setAttribute('fill', 'rgba(245, 247, 255, 0.88)');")
    .replace(
      /("margin":\{"l":0,"r":0,"b":0,"t":30\},"font":\{"color":)"#0b1020"(\},"paper_bgcolor")/g,
      '$1"#f5f7ff"$2'
    )
    .replaceAll('"font":{"color":"#f5f7ff"}', `"font":{"family":"${APP_FONT_STACK}","color":"#f5f7ff"}`)
    .replaceAll('"font":{"color":"#0b1020"', `"font":{"family":"${APP_FONT_STACK}","color":"#0b1020"`)
    .replaceAll('"font":{"size":10}', `"font":{"family":"${APP_FONT_STACK}","size":10}`)
    .replaceAll('"font":{"color":"#f5f7ff"', `"font":{"family":"${APP_FONT_STACK}","color":"#f5f7ff"`)
    .replace(
      "</style>",
      `
                html,
                body,
                #plotly-wrapper {
                    background-color: #111733 !important;
                    background-image: none !important;
                    font-family: ${APP_FONT_STACK};
                }

                html,
                body {
                    min-height: 100%;
                }

                @media (max-width: 768px) {
                    html,
                    body,
                    #plotly-wrapper {
                        min-height: 100dvh;
                    }
                }

                body *,
                button {
                    font-family: inherit !important;
                }

                #plotly-wrapper .updatemenu-button rect.updatemenu-item-bg {
                    fill: rgba(17, 24, 46, 0.96) !important;
                    stroke: rgba(148, 163, 184, 0.36) !important;
                    stroke-width: 1px !important;
                    rx: 10px !important;
                    ry: 10px !important;
                    filter: drop-shadow(0 8px 18px rgba(4, 8, 18, 0.22));
                }

                #plotly-wrapper .updatemenu-button.active rect.updatemenu-item-bg {
                    fill: rgba(0, 245, 138, 0.18) !important;
                    stroke: #00f58a !important;
                    stroke-width: 2px !important;
                }

                #plotly-wrapper .updatemenu-item-text {
                    fill: rgba(245, 247, 255, 0.88) !important;
                    font-weight: 800 !important;
                }

                #plotly-wrapper .updatemenu-button.active .updatemenu-item-text {
                    fill: #00f58a !important;
                }

                .legend .traces,
                .legend .legendpoints,
                .legend .legendpoints path,
                .legend .scatterpts,
                .legend text {
                    opacity: 1 !important;
                }
            </style>`
    );
}

function styleHtml(
  filePath: string,
  html: string,
  canAccessCup: boolean,
  articleLink?: ArchetypesArticleLink,
  cupAccessToken: string | null = null
): string {
  return path.basename(filePath) === "index.html" && articleLink
    ? styleIndexHtml(html, articleLink, canAccessCup, cupAccessToken)
    : stylePlotHtml(html);
}

export async function GET(request: Request, context: ArchetypesRouteContext) {
  const { path: pathParts } = await context.params;
  const { userId } = await auth();
  const token = new URL(request.url).searchParams.get("cupAccess");
  const canAccessCup = (await getServerProPlotAccess(userId)) || isValidArchetypesCupToken(token);
  const requestedPath = pathParts?.join("/") ?? "index.html";

  if (requestedPath === "cup-player-leagues.json") {
    if (!canAccessCup) {
      return NextResponse.json({ error: "Cup archetypes require Pro or Premium access" }, { status: 403 });
    }

    try {
      return NextResponse.json(await fetchCupPlayerLeagues(), {
        headers: { "Cache-Control": "private, max-age=300" },
      });
    } catch (error) {
      console.error("Failed to fetch Cup player leagues:", error);
      return NextResponse.json({ error: "Failed to fetch Cup player leagues" }, { status: 500 });
    }
  }

  const filePath = resolveArchetypePath(pathParts);

  if (!filePath) {
    return NextResponse.json({ error: "Invalid archetypes path" }, { status: 400 });
  }

  try {
    if (!canAccessCup && isCupArchetypeAsset(filePath)) {
      return NextResponse.json({ error: "Cup archetypes require Pro or Premium access" }, { status: 403 });
    }

    const extension = path.extname(filePath);
    const contentType = CONTENT_TYPES[extension] ?? "application/octet-stream";
    const file = await readFile(filePath);
    const articleLink = path.basename(filePath) === "index.html" ? getArchetypesArticleLink() : undefined;
    const body = extension === ".html"
      ? styleHtml(filePath, file.toString("utf8"), canAccessCup, articleLink, canAccessCup ? token : null)
      : file;

    return new NextResponse(body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return NextResponse.json({ error: "Archetype asset not found" }, { status: 404 });
    }

    console.error("Failed to serve archetype asset:", error);
    return NextResponse.json({ error: "Failed to serve archetype asset" }, { status: 500 });
  }
}

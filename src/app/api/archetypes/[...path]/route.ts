import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { isValidArchetypesCupToken } from "@/lib/access/archetypes-cup-token";
import { getServerProPlotAccess } from "@/lib/access/pro-access-server";

export const dynamic = "force-dynamic";

const ARCHETYPES_DIR = path.join(process.cwd(), "nrl_archetypes");
const CURRENT_ARCHETYPE_YEAR = "2026";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const APP_FONT_STACK = "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";

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

function normalizeRecentWindowPlotPath(filePath: string): string {
  const basename = path.basename(filePath);
  const normalizedBasename = basename.replace(
    /_((?:team_share_)?l(?:3|5|10))_(?:all|\d{4}s)\.html$/,
    `_$1_${CURRENT_ARCHETYPE_YEAR}.html`
  );

  return normalizedBasename === basename
    ? filePath
    : path.join(path.dirname(filePath), normalizedBasename);
}

function isCupArchetypeAsset(filePath: string): boolean {
  return path.basename(filePath).startsWith("cup_");
}

function gateCupIndexAssets(html: string): string {
  return html
    .replaceAll(/\s*<script src="cup_[^"]+"><\/script>/g, "")
    .replace(
      '<button class="mode-btn" data-competition="cup">Cup</button>',
      '<button class="mode-btn" data-competition="cup" disabled title="Cup archetypes require Pro or Premium access">Cup <span class="mode-btn-pro">Pro</span></button>'
    );
}

function styleIndexHtml(
  html: string,
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
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 0.32rem;
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

        .control-stack {
            gap: 0.52rem;
        }

        .control-frame .mode-btn {
            padding: 0.34rem 0.58rem;
            font-size: 0.62rem;
            letter-spacing: 0.1em;
        }

        #windowControlFrame,
        #decadeControlFrame {
            gap: 0;
            padding: 0;
        }

        .control-select {
            min-width: 4.7rem;
            border-radius: 999px;
            padding: 0.34rem 1.6rem 0.34rem 0.58rem;
            font-size: 0.62rem;
            letter-spacing: 0.08em;
        }

        #decadeToggle .mode-btn {
            text-transform: none;
        }

        .control-divider {
            height: 1.15rem;
        }

        #modeControlFrame,
        #modeToggle {
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

        .mode-btn-pro {
            display: inline-flex;
            align-items: center;
            border: 1px solid rgba(0, 245, 138, 0.6);
            border-radius: 0.16rem;
            color: #00f58a;
            font-size: 0.42rem;
            font-weight: 900;
            letter-spacing: 0.08em;
            line-height: 1;
            padding: 0.08rem 0.16rem;
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

            .control-stack {
                gap: 0.42rem;
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

    </style>
    <script>
        const archetypesCupAccessQuery = ${JSON.stringify(cupAccessQuery)};
        function withCupAccess(assetPath) {
            if (!archetypesCupAccessQuery || !assetPath.startsWith('cup_')) return assetPath;
            return assetPath + archetypesCupAccessQuery;
        }

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
  cupAccessToken: string | null = null
): string {
  return path.basename(filePath) === "index.html"
    ? styleIndexHtml(html, canAccessCup, cupAccessToken)
    : stylePlotHtml(html);
}

export async function GET(request: Request, context: ArchetypesRouteContext) {
  const { path: pathParts } = await context.params;
  const { userId } = await auth();
  const token = new URL(request.url).searchParams.get("cupAccess");
  const canAccessCup = (await getServerProPlotAccess(userId)) || isValidArchetypesCupToken(token);

  const requestedFilePath = resolveArchetypePath(pathParts);

  if (!requestedFilePath) {
    return NextResponse.json({ error: "Invalid archetypes path" }, { status: 400 });
  }

  try {
    const filePath = normalizeRecentWindowPlotPath(requestedFilePath);
    if (!canAccessCup && isCupArchetypeAsset(filePath)) {
      return NextResponse.json({ error: "Cup archetypes require Pro or Premium access" }, { status: 403 });
    }

    const extension = path.extname(filePath);
    const contentType = CONTENT_TYPES[extension] ?? "application/octet-stream";
    const file = await readFile(filePath);
    const body = extension === ".html"
      ? styleHtml(filePath, file.toString("utf8"), canAccessCup, canAccessCup ? token : null)
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

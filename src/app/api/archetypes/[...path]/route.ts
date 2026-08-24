import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getServerProPlotAccess } from "@/lib/access/pro-access-server";

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
      '<button class="mode-btn" data-competition="cup" data-pro-required="true" disabled title="Cup archetypes require Pro or Premium access"><span>Cup</span><span class="cup-pro-badge" aria-hidden="true">PRO</span></button>'
    );
}

function styleIndexHtml(html: string, articleLink: ArchetypesArticleLink, canAccessCup: boolean): string {
  return (canAccessCup ? html : gateCupIndexAssets(html))
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
            gap: 0.55rem;
            border: 0;
            background: transparent;
            padding: 0;
        }

        .control-frame .mode-toggle {
            flex-wrap: nowrap;
            gap: 0.16rem;
            border: 1px solid #2a3356;
            border-radius: 999px;
            background: rgba(17, 24, 50, 0.72);
            padding: 0.18rem;
        }

        #modeToggle {
            display: none;
        }

        .control-frame .mode-btn {
            padding: 0.34rem 0.58rem;
            font-size: 0.62rem;
            letter-spacing: 0.1em;
        }

        .mode-btn[data-competition="cup"] {
            display: inline-flex;
            align-items: center;
            gap: 0.28rem;
        }

        .mode-btn[data-pro-required="true"] {
            opacity: 0.72;
        }

        .cup-pro-badge {
            display: inline-flex;
            align-items: center;
            min-height: 0.8rem;
            border: 1px solid rgba(0, 245, 138, 0.66);
            border-radius: 3px;
            color: #00f58a;
            font-size: 0.38rem;
            font-weight: 900;
            letter-spacing: 0.08em;
            line-height: 1;
            padding: 0.14rem 0.2rem;
        }

        .control-divider {
            display: none;
        }

        .tabs {
            gap: 0.4rem;
            margin-bottom: 1rem;
        }

        .controls-row {
            flex-direction: row;
            flex-wrap: nowrap;
            align-items: center;
            gap: 0.65rem;
            margin-bottom: 0.45rem;
            overflow-x: auto;
        }

        .position-select {
            display: block;
            flex: 0 0 10rem;
            min-width: 10rem;
        }

        .position-select select {
            height: 2rem;
            border-color: #2a3356;
            background-color: #161c32;
            color: #f5f7ff;
            font-size: 0.62rem;
            letter-spacing: 0.12em;
            outline: none;
            padding: 0 2rem 0 0.8rem;
        }

        .position-select select:focus {
            border-color: #00f58a;
        }

        .position-select::after {
            right: 0.82rem;
            top: 50%;
            bottom: auto;
            width: 0.36rem;
            height: 0.36rem;
            border-width: 1.5px;
            color: #f5f7ff;
            transform: translateY(-70%) rotate(45deg);
        }

        .desktop-year-toggle {
            height: 2rem;
            gap: 0.16rem;
            padding: 0.18rem;
        }

        .desktop-year-btn {
            height: 1.5rem;
            padding: 0 0.58rem;
            font-size: 0.62rem;
            letter-spacing: 0.08em;
            text-transform: uppercase;
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

        .content-grid {
            height: calc(100vh - 190px);
            min-height: 360px;
        }

        @media (max-width: 768px) {
            html,
            body {
                min-height: 100dvh;
            }

            .content-grid {
                height: auto;
                min-height: 0;
            }

            .controls-row {
                margin-bottom: 0.35rem;
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

            .plot-container {
                align-self: start;
                height: clamp(360px, 58dvh, 520px);
            }
        }

        @media (min-width: 769px) and (max-width: 1024px) {
            .content-grid {
                height: auto;
                min-height: 0;
            }

            .plot-container {
                align-self: start;
                height: clamp(460px, 62dvh, 640px);
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
                    try {
                        frame.contentWindow && frame.contentWindow.dispatchEvent(new Event('resize'));
                    } catch (_) {}
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
    .replaceAll("#0A1128", "#f5f7ff")
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
    .replaceAll('"margin":{"l":0,"r":0,"b":0,"t":30}', '"margin":{"l":0,"r":0,"b":20,"t":30}')
    .replaceAll('"margin":{"l":0,"r":0,"b":80,"t":30}', '"margin":{"l":0,"r":0,"b":20,"t":30}')
    .replaceAll('"legend":{"title":{"text":"Archetype"}}', '"legend":{"title":{"text":"Archetype"},"orientation":"v","x":0.02,"xanchor":"left","y":0.02,"yanchor":"bottom","font":{"color":"#f5f7ff","size":10},"bgcolor":"rgba(17,24,46,0.72)"}')
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
                    height: 100%;
                    min-height: 100%;
                }

                #plotly-wrapper,
                #plotly-wrapper > div:not(#archetype-controls),
                #plotly-wrapper .plot-container,
                #plotly-wrapper .svg-container,
                #plotly-wrapper .main-svg,
                #plotly-wrapper .plotly-graph-div {
                    min-height: 100%;
                    height: 100% !important;
                    width: 100% !important;
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

                #plotly-wrapper .main-svg text {
                    fill: #f5f7ff !important;
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

function styleHtml(filePath: string, html: string, canAccessCup: boolean, articleLink?: ArchetypesArticleLink): string {
  return path.basename(filePath) === "index.html" && articleLink ? styleIndexHtml(html, articleLink, canAccessCup) : stylePlotHtml(html);
}

export async function GET(_request: Request, context: ArchetypesRouteContext) {
  const { path: pathParts } = await context.params;
  const filePath = resolveArchetypePath(pathParts);

  if (!filePath) {
    return NextResponse.json({ error: "Invalid archetypes path" }, { status: 400 });
  }

  try {
    const { userId } = await auth();
    const canAccessCup = await getServerProPlotAccess(userId);
    if (!canAccessCup && isCupArchetypeAsset(filePath)) {
      return NextResponse.json({ error: "Cup archetypes require Pro or Premium access" }, { status: 403 });
    }

    const extension = path.extname(filePath);
    const contentType = CONTENT_TYPES[extension] ?? "application/octet-stream";
    const file = await readFile(filePath);
    const articleLink = path.basename(filePath) === "index.html" ? getArchetypesArticleLink() : undefined;
    const body = extension === ".html" ? styleHtml(filePath, file.toString("utf8"), canAccessCup, articleLink) : file;

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

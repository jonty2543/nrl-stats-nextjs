import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ARCHETYPES_DIR = path.join(process.cwd(), "nrl_archetypes");

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

function styleIndexHtml(html: string): string {
  return html
    .replaceAll("--navy: #0A1128;", "--navy: #0b1020;")
    .replaceAll("--lime: #C9FF00;", "--lime: #00f58a;")
    .replaceAll("--white: #FFFFFF;", "--white: #f5f7ff;")
    .replaceAll("--gray: #1E2742;", "--gray: #1e2542;")
    .replaceAll("--card-bg: #151E3F;", "--card-bg: #161c32;")
    .replaceAll("--border-color: #2A3B6E;", "--border-color: #2a3356;")
    .replace(
      "</style>",
      `
        body {
            background-color: #0b1020;
            font-family: ${APP_FONT_STACK};
        }

        body *,
        button {
            font-family: inherit !important;
        }

        header {
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            background: rgba(11, 16, 32, 0.92);
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
            max-width: 100%;
        }

        .tab-btn,
        .year-btn {
            border-radius: 999px;
            letter-spacing: 0.14em;
        }

        .tab-btn {
            padding: 0.5rem 0.9rem;
            font-size: 0.78rem;
        }

        .tab-btn.active,
        .year-btn.active {
            background-color: rgba(0, 245, 138, 0.14);
            color: #00f58a;
        }

        .tab-btn:hover,
        .year-btn:hover {
            background-color: rgba(0, 245, 138, 0.08);
        }

        @media (max-width: 768px) {
            .tabs {
                gap: 0.55rem;
            }

            .tab-btn {
                padding: 0.42rem 0.72rem;
                font-size: 0.68rem;
            }
        }

        .plot-container,
        .archetype-card,
        .ml-explanation {
            box-shadow: 0 18px 60px rgba(0, 0, 0, 0.22);
        }

        .description,
        .ml-section p {
            color: #c7d0e6;
        }
    </style>`
    );
}

function stylePlotHtml(html: string): string {
  return html
    .replaceAll("#C9FF00", "#00f58a")
    .replaceAll("#c9ff00", "#00f58a")
    .replaceAll("#0A1128", "#0b1020")
    .replaceAll("#151E3F", "#161c32")
    .replaceAll("#1E2742", "#1e2542")
    .replaceAll("#2A3B6E", "#2a3356")
    .replaceAll("#f0f0f0", "#161c32")
    .replaceAll("#E5ECF6", "#1e2542")
    .replaceAll("#2a3f5f", "#f5f7ff")
    .replaceAll('"gridcolor":"white"', '"gridcolor":"rgba(245,247,255,0.14)"')
    .replaceAll('"zerolinecolor":"white"', '"zerolinecolor":"rgba(245,247,255,0.18)"')
    .replaceAll('"gridwidth":2', '"gridwidth":1')
    .replaceAll('"opacity":0.8,"size":5', '"opacity":0.82,"size":3.5')
    .replaceAll("'marker.size': 6", "'marker.size': 4")
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
                body {
                    background: #161c32;
                    font-family: ${APP_FONT_STACK};
                }

                body *,
                button {
                    font-family: inherit !important;
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

function styleHtml(filePath: string, html: string): string {
  return path.basename(filePath) === "index.html" ? styleIndexHtml(html) : stylePlotHtml(html);
}

export async function GET(_request: Request, context: ArchetypesRouteContext) {
  const { path: pathParts } = await context.params;
  const filePath = resolveArchetypePath(pathParts);

  if (!filePath) {
    return NextResponse.json({ error: "Invalid archetypes path" }, { status: 400 });
  }

  try {
    const extension = path.extname(filePath);
    const contentType = CONTENT_TYPES[extension] ?? "application/octet-stream";
    const file = await readFile(filePath);
    const body = extension === ".html" ? styleHtml(filePath, file.toString("utf8")) : file;

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

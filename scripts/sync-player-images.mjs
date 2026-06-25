import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const PAGE_SIZE = 1000;
const DEFAULT_BUCKET = "player-images";
const DEFAULT_PREFIX = "players";
const DEFAULT_CONCURRENCY = 4;

function parseArgs(argv) {
  const args = {
    dryRun: false,
    force: false,
    limit: null,
    player: null,
    concurrency: DEFAULT_CONCURRENCY,
  };

  for (const arg of argv) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--force") args.force = true;
    else if (arg.startsWith("--limit=")) args.limit = Number(arg.slice("--limit=".length));
    else if (arg.startsWith("--player=")) args.player = arg.slice("--player=".length).trim();
    else if (arg.startsWith("--concurrency=")) args.concurrency = Number(arg.slice("--concurrency=".length));
  }

  if (args.limit != null && (!Number.isInteger(args.limit) || args.limit < 1)) {
    throw new Error("--limit must be a positive integer");
  }
  if (!Number.isInteger(args.concurrency) || args.concurrency < 1 || args.concurrency > 12) {
    throw new Error("--concurrency must be an integer from 1 to 12");
  }

  return args;
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function loadLocalEnv() {
  for (const file of [".env.local", ".env"]) {
    try {
      const raw = await readFile(file, "utf8");
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
        if (!match || process.env[match[1]] != null) continue;
        process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
      }
    } catch {
      // Env files are optional for CI and hosted jobs.
    }
  }
}

function slugify(value) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "unknown";
}

function decodeSource(source) {
  try {
    return decodeURIComponent(source);
  } catch {
    return source;
  }
}

function upgradeHttp(source) {
  return source.startsWith("http://") ? `https://${source.slice("http://".length)}` : source;
}

function imageSourceCandidates(source) {
  const out = [];
  const seen = new Set();
  const push = (value) => {
    const normalised = value ? upgradeHttp(decodeSource(value.trim())) : "";
    if (!normalised || seen.has(normalised)) return;
    seen.add(normalised);
    out.push(normalised);
  };

  const trimmed = source?.trim();
  if (!trimmed) return out;

  const marker = "/remote.axd?";
  const markerIndex = trimmed.indexOf(marker);
  if (markerIndex >= 0) {
    const nested = trimmed.slice(markerIndex + marker.length).split("&preset=")[0];
    push(nested);
  }

  push(trimmed);
  return out;
}

function cacheObjectPath(row, kind, sourceUrl) {
  const rowKey = slugify([row.team, row.player, row.number, row.position].filter(Boolean).join("-"));
  const hash = crypto.createHash("sha1").update(sourceUrl).digest("hex").slice(0, 10);
  return `${process.env.PLAYER_IMAGE_STORAGE_PREFIX || DEFAULT_PREFIX}/${rowKey}/${kind}-${hash}.webp`;
}

async function fetchAllPlayerImages(supabase) {
  const rows = [];
  let start = 0;

  while (true) {
    const end = start + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("player_images")
      .select("player,team,number,position,head_image,body_image,cached_head_image,cached_body_image,last_seen_match_date")
      .range(start, end);

    if (error) {
      throw new Error(`Unable to fetch nrl.player_images. Run sql/nrl_player_images_cache.sql first if cached columns are missing. ${error.message}`);
    }

    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    start += PAGE_SIZE;
  }

  return rows;
}

async function ensurePublicBucket(supabase, bucket) {
  const { data, error } = await supabase.storage.getBucket(bucket);
  if (!error && data) {
    if (!data.public) {
      const { error: updateError } = await supabase.storage.updateBucket(bucket, { public: true });
      if (updateError) throw new Error(`Unable to make storage bucket ${bucket} public: ${updateError.message}`);
    }
    return;
  }

  const { error: createError } = await supabase.storage.createBucket(bucket, {
    public: true,
    allowedMimeTypes: ["image/webp"],
    fileSizeLimit: 2 * 1024 * 1024,
  });
  if (createError) throw new Error(`Unable to create storage bucket ${bucket}: ${createError.message}`);
}

async function downloadFirstAvailable(candidates) {
  const errors = [];

  for (const url of candidates) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": "shortside-player-image-cache/1.0" },
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        errors.push(`${response.status} ${url}`);
        continue;
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length === 0) {
        errors.push(`empty ${url}`);
        continue;
      }

      return { buffer, sourceUrl: url };
    } catch (error) {
      errors.push(`${error instanceof Error ? error.message : String(error)} ${url}`);
    }
  }

  throw new Error(errors.join("; "));
}

async function optimiseImage(buffer, kind) {
  const image = sharp(buffer, { failOn: "none" }).rotate();
  if (kind === "head") {
    return image
      .resize({ width: 220, height: 220, fit: "cover", position: "top", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
  }

  return image
    .resize({ height: 640, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
}

function applyRowIdentityFilters(query, row) {
  let next = query.eq("player", row.player);
  for (const column of ["team", "number", "position", "last_seen_match_date"]) {
    const value = row[column];
    next = value == null ? next.is(column, null) : next.eq(column, value);
  }
  return next;
}

async function uploadCachedImage({ supabase, bucket, row, kind, sourceUrl, buffer }) {
  const optimised = await optimiseImage(buffer, kind);
  const objectPath = cacheObjectPath(row, kind, sourceUrl);
  const { error: uploadError } = await supabase.storage.from(bucket).upload(objectPath, optimised, {
    contentType: "image/webp",
    upsert: true,
    cacheControl: "31536000",
  });
  if (uploadError) throw new Error(`Upload failed for ${objectPath}: ${uploadError.message}`);

  const { data } = supabase.storage.from(bucket).getPublicUrl(objectPath);
  const column = kind === "head" ? "cached_head_image" : "cached_body_image";
  const { error: updateError } = await applyRowIdentityFilters(
    supabase.from("player_images").update({ [column]: data.publicUrl }),
    row
  );
  if (updateError) throw new Error(`DB update failed for ${row.player} ${kind}: ${updateError.message}`);

  return { publicUrl: data.publicUrl, bytes: optimised.length };
}

async function syncOneKind({ supabase, bucket, row, kind, args }) {
  const source = kind === "head" ? row.head_image : row.body_image;
  const cached = kind === "head" ? row.cached_head_image : row.cached_body_image;
  if (!source || (!args.force && cached)) return { status: "skipped" };

  const candidates = imageSourceCandidates(source);
  if (candidates.length === 0) return { status: "skipped" };

  if (args.dryRun) {
    return { status: "dry-run", sourceUrl: candidates[0] };
  }

  const { buffer, sourceUrl } = await downloadFirstAvailable(candidates);
  const uploaded = await uploadCachedImage({ supabase, bucket, row, kind, sourceUrl, buffer });
  return { status: "uploaded", sourceUrl, ...uploaded };
}

async function runPool(items, concurrency, worker) {
  let cursor = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index], index);
    }
  });
  await Promise.all(workers);
}

async function main() {
  await loadLocalEnv();
  const args = parseArgs(process.argv.slice(2));
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const bucket = process.env.PLAYER_IMAGE_STORAGE_BUCKET || DEFAULT_BUCKET;
  const supabase = createClient(supabaseUrl, serviceRoleKey, { db: { schema: "nrl" } });

  if (!args.dryRun) await ensurePublicBucket(supabase, bucket);

  let rows = await fetchAllPlayerImages(supabase);
  if (args.player) rows = rows.filter((row) => row.player?.toLowerCase().includes(args.player.toLowerCase()));
  rows = rows.filter((row) => row.player && (row.head_image || row.body_image));
  if (args.limit != null) rows = rows.slice(0, args.limit);

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;
  let savedBytes = 0;

  await runPool(rows, args.concurrency, async (row) => {
    for (const kind of ["body", "head"]) {
      try {
        const result = await syncOneKind({ supabase, bucket, row, kind, args });
        if (result.status === "uploaded") {
          uploaded += 1;
          savedBytes += result.bytes;
          console.log(`uploaded ${kind} ${row.player}: ${Math.round(result.bytes / 1024)}KB`);
        } else if (result.status === "dry-run") {
          console.log(`dry-run ${kind} ${row.player}: ${result.sourceUrl}`);
        } else {
          skipped += 1;
        }
      } catch (error) {
        failed += 1;
        console.warn(`failed ${kind} ${row.player}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  });

  console.log(`Done. uploaded=${uploaded} skipped=${skipped} failed=${failed} output=${Math.round(savedBytes / 1024)}KB`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

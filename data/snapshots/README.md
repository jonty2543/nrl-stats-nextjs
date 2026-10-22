# Local stats snapshots

Stats routes read these server-only datasets instead of waiting for database queries,
following shortside-nba's prebuilt-data loading pattern. Season and Pro access checks
still happen before data reaches the browser. Missing snapshots fall back to Supabase.

Run `npm run snapshot:stats` to refresh all competitions, player images and logos.
For a partial refresh use `npm run snapshot:stats -- nrl assets` (or `cup`,
`international`, `origin`). Refresh before deployment and after stats updates.
Compressed JSON files (`*.json.gz`) are generated and included in Next server output through file tracing;
copy or regenerate them on each deployment host. Do not place them in `public/`.

Snapshots stay fixed until refreshed, including the live season. Set
`STATS_SNAPSHOT_DISABLED=1` to temporarily return to live database reads.
Files are split by season and player so pages only read relevant data. Each file is
replaced atomically, with the season index published after a successful refresh.

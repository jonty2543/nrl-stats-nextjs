"use client";

import Image from "next/image";
import type { HalvesPairingPoint, PlayerAttackComparisonStat } from "@/lib/data/player-attack";

interface HalvesPairingBarsProps {
  pairings: HalvesPairingPoint[];
  stat: PlayerAttackComparisonStat;
  playerFaceImages: Record<string, string>;
}

const LEFT_COLOR = "#4f9cff";
const RIGHT_COLOR = "#10f08b";

function normalisePlayerName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function PlayerFace({ player, src, color }: { player: string; src?: string; color: string }) {
  return (
    <div className="relative grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-nrl-panel text-[9px] font-black text-nrl-text shadow-lg" style={{ border: `2px solid ${color}` }}>
      {src ? <Image src={src} alt="" fill sizes="36px" unoptimized className="object-cover" /> : player.slice(0, 1).toUpperCase()}
    </div>
  );
}

function totalLabel(value: number): string {
  return Math.round(value).toLocaleString("en-AU");
}

export function HalvesPairingBars({ pairings, stat, playerFaceImages }: HalvesPairingBarsProps) {
  if (pairings.length === 0) {
    return <div className="grid min-h-72 place-items-center px-4 text-center text-sm font-black text-nrl-muted">No halves pairings have five shared games with a recorded {stat.toLowerCase()} total.</div>;
  }

  return (
    <ol className="divide-y divide-nrl-border px-4 sm:px-6">
      {pairings.map((pairing) => {
        const leftFace = playerFaceImages[normalisePlayerName(pairing.leftPlayer)];
        const rightFace = playerFaceImages[normalisePlayerName(pairing.rightPlayer)];
        return (
          <li key={pairing.id} className="py-5">
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-3 text-xs">
              <div className="min-w-0">
                <div className="truncate font-black text-nrl-text">{pairing.leftPlayer}</div>
                <div className="font-bold" style={{ color: LEFT_COLOR }}>#7 · {pairing.leftShare.toFixed(1)}%</div>
              </div>
              <div className="text-center text-[9px] font-bold uppercase tracking-wide text-nrl-muted">{pairing.team}<br />{pairing.games} games</div>
              <div className="min-w-0 text-right">
                <div className="truncate font-black text-nrl-text">{pairing.rightPlayer}</div>
                <div className="font-bold" style={{ color: RIGHT_COLOR }}>{pairing.rightShare.toFixed(1)}% · #6</div>
              </div>
            </div>

            <div className="mt-5 px-5">
              <div
                className="relative flex h-3 overflow-visible rounded-full bg-nrl-bg shadow-inner"
                role="img"
                aria-label={`Halfback ${pairing.leftPlayer} ${pairing.leftShare.toFixed(1)} percent and five-eighth ${pairing.rightPlayer} ${pairing.rightShare.toFixed(1)} percent of the pairing's ${stat.toLowerCase()}`}
              >
                <div className="h-full rounded-l-full" style={{ width: `${pairing.leftShare}%`, backgroundColor: LEFT_COLOR }} />
                <div className="h-full rounded-r-full" style={{ width: `${pairing.rightShare}%`, backgroundColor: RIGHT_COLOR }} />
                <div
                  className="absolute top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 -space-x-2"
                  style={{ left: `clamp(2.5rem, ${pairing.leftShare}%, calc(100% - 2.5rem))` }}
                >
                  <PlayerFace player={pairing.leftPlayer} src={leftFace} color={LEFT_COLOR} />
                  <PlayerFace player={pairing.rightPlayer} src={rightFace} color={RIGHT_COLOR} />
                </div>
              </div>
            </div>

            <div className="mt-4 flex justify-between px-5 text-[9px] font-bold text-nrl-muted">
              <span>{totalLabel(pairing.leftValue)} {stat.toLowerCase()}</span>
              <span>{totalLabel(pairing.rightValue)} {stat.toLowerCase()}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

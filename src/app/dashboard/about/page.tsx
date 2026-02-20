import Image from "next/image";

export default function AboutPage() {
  return (
    <div className="rounded-xl border border-nrl-border bg-nrl-panel p-6">
      <div className="flex items-center gap-3">
        <Image
          src="/logo-mark.svg"
          alt="Short Side logo"
          width={40}
          height={40}
          priority
        />
        <div>
          <h1 className="text-xl font-bold text-nrl-text">About Short Side</h1>
        </div>
      </div>

      <div className="mt-5 max-w-3xl text-sm leading-6 text-nrl-text">
        <p>
          Short Side exists to bring smarter analysis to Rugby League.
        </p>
        <p className="mt-3 text-nrl-text">
          Our goal is to make data and statistical analysis accessible for all
          footy fans. We&apos;re building tools for fantasy players, bettors,
          and serious fans who want more than surface level stats, and creating
          a community where anyone can share their analysis.
        </p>
        <p className="mt-3 text-nrl-text">
          While we will offer tools that make it easy and accessible for
          everyone to acquire data-driven processes, we will also be releasing
          educational pieces to help you do some DIY analysis and modelling, so
          you can translate your footy IQ to numbers and help contribute to the
          evolving landscape of data in the NRL.
        </p>

        <div className="mt-5 flex flex-wrap gap-3">
          <a
            href="https://www.instagram.com/shortside.nrl/?hl=en"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md border border-nrl-border bg-nrl-panel-2 px-3 py-1.5 text-sm font-semibold text-nrl-text transition-colors hover:border-nrl-accent hover:text-nrl-accent"
            aria-label="Short Side on Instagram"
          >
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="5" />
              <circle cx="12" cy="12" r="4" />
              <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
            </svg>
            <span>Instagram</span>
          </a>

          <a
            href="https://x.com/shortsidenrl"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md border border-nrl-border bg-nrl-panel-2 px-3 py-1.5 text-sm font-semibold text-nrl-text transition-colors hover:border-nrl-accent hover:text-nrl-accent"
            aria-label="Short Side on X"
          >
            <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
              <path d="M18.244 2H21l-6.558 7.495L22.164 22h-6.05l-4.74-6.204L5.95 22H3.19l7.014-8.01L2 2h6.205l4.285 5.67L18.244 2Zm-2.12 18h1.676L7.295 3.894H5.496L16.124 20Z" />
            </svg>
            <span>X</span>
          </a>
        </div>
      </div>
    </div>
  );
}

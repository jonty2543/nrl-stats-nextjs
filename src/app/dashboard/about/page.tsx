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
      </div>
    </div>
  );
}

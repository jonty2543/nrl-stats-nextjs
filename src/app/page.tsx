import Image from "next/image"
import Link from "next/link"
import type { CSSProperties } from "react"
import { AppHeader } from "@/components/layout/app-header"
import { LandingHeroScrollShell } from "@/components/views/landing-hero-scroll-shell"
import styles from "./landing-page.module.css"

export const dynamic = "force-static"

const features = [
  { number: "01", eyebrow: "Betting", title: "See where the market might have it wrong", description: "Compare bookie prices against model predictions across H2H, line, total and tryscorer markets, then calculate your stake and track every bet", href: "/dashboard/betting", graphic: "board" },
  { number: "02", eyebrow: "Stats", title: "Know who's in form — and why", description: "See who is getting through the work, breaking the line and producing when it matters, then compare players, teams, recent form, rankings and archetypes", href: "/dashboard/players", graphic: "bars" },
  { number: "03", eyebrow: "Fantasy", title: "Make the trade with the full picture", description: "Check price, breakeven, projection, recent form and game logs before you buy, hold or sell, with five-star trade ratings bringing it all together", href: "/dashboard/fantasy", graphic: "signal" },
  { number: "04", eyebrow: "Matches", title: "Read the team sheet before kickoff", description: "Once teams are named, see who lines up left, middle and right, where each side scores and concedes, and how the matchup shapes up", href: "/dashboard/lineups", graphic: "field" },
]

const plans = [
  { name: "Free", price: "$0", suffix: "", description: "Get around Short Side and see what it can do", features: ["Core app access", "Standard dashboards", "Current free stats access"], href: "/sign-up", cta: "Create free account" },
  { name: "Pro", price: "$5", suffix: "/month", description: "For fantasy coaches and fans who love the numbers", features: ["Fantasy projections and breakevens", "All Fantasy and Stats plots", "Trade ratings and advanced models"], href: "/dashboard/billing", cta: "Choose Pro", featured: true },
  { name: "Premium", price: "$40", suffix: "/month", description: "For punters who want the full picture before kickoff", features: ["Everything in Pro", "H2H, line, total and tryscorer models", "Bet tracker and full matchup insights"], href: "/dashboard/billing", cta: "Choose Premium" },
]

function FeatureGraphic({ type }: { type: string }) {
  if (type === "board") return (
    <div className={styles.miniBoard} aria-hidden="true">
      <div className={styles.miniBoardTop}><span>ROUND MATCHUP</span><span>● LIVE MODEL</span></div>
      <div className={styles.miniTeams}><strong>HOME</strong><span>V</span><strong>AWAY</strong></div>
      <div className={styles.miniStats}><span><i>EDGE</i><b>+4.5</b></span><span><i>FORM</i><b>72</b></span><span><i>VALUE</i><b>63%</b></span></div>
    </div>
  )
  if (type === "bars") {
    const heights = [34, 47, 42, 61, 75, 68, 91]
    return <div className={styles.trendBars} aria-hidden="true">{heights.map((height, index) => <i key={index} style={{ "--bar-height": `${height}%` } as CSSProperties} />)}</div>
  }
  if (type === "field") return <div className={styles.fieldGraphic} aria-hidden="true"><span /><span /><span /><b>R</b><b>M</b><b>L</b></div>
  return <div className={styles.signalGraphic} aria-hidden="true"><span /><span /><span /><b>5★</b></div>
}

export default function Home() {
  return (
    <div className={styles.page}>
      <div className={styles.noise} aria-hidden="true" />
      <AppHeader sticky showBillingNav />

      <main>
        <LandingHeroScrollShell>
          <section className={styles.hero}>
            <div className={styles.heroCopy} data-landing-reveal>
              <h1>Smarter Analysis for<br /><em>Rugby League</em></h1>
              <p className={styles.heroLede}>The stats, form and matchup context behind every round — for fans who want to know why, not just what happened</p>
              <div className={styles.heroActions}>
                <Link href="/sign-up" className={styles.primaryButton}>Create free account <span>↗</span></Link>
                <a href="#tools" className={styles.textLink}>See every tool <span>↓</span></a>
              </div>
              <p className={styles.ctaNote}>Start on the Free plan, then upgrade when you want deeper stats, fantasy or betting tools</p>
              <div className={styles.heroProof} aria-label="Product benefits">
                <div><strong>$0</strong><span>Free plan</span></div><div><strong>17</strong><span>NRL clubs covered</span></div><div><strong>4</strong><span>Core toolkits</span></div>
              </div>
            </div>

            <div className={styles.heroVisual} data-landing-reveal>
              <div className={styles.heroImageWrap}><Image src="/nrl_players.jpg" alt="NRL players on the field" fill priority sizes="(min-width: 1024px) 58vw, 100vw" className={styles.heroImage} /></div>
              <div className={styles.fieldLines} aria-hidden="true" />
              <Link className={styles.floatingBoard} href="#tools">
                <span>Short Side NRL</span>
                <strong>4 toolkits</strong>
                <small>Betting · stats · fantasy · matches</small>
                <b>See every tool ↗</b>
              </Link>
            </div>
            <div className={styles.scrollNote} aria-hidden="true"><span /> Scroll to read the game</div>
          </section>

          <div className={styles.ticker} aria-label="Short Side NRL principles"><div>
              {["Form matters", "Win the middle", "Know the role", "Read the matchup", "Every carry counts", "Form matters"].map((item, index) => <span key={`${item}-${index}`}>{item} <i>◆</i></span>)}
          </div></div>

          <section className={styles.manifesto} id="edge">
            <div className={styles.sectionIndex}>01 — THE EDGE</div>
            <div className={styles.manifestoCopy} data-landing-reveal>
              <p className={styles.kicker}>The footy behind the numbers</p>
              <h2>Stats mean more<br />when you know the <em>context</em></h2>
              <p>A stat never tells the whole story on its own, so Short Side brings form, role, matchups and market data together to show who is playing well, why it is happening and whether it can hold up</p>
            </div>
            <div className={styles.orbitGraphic} data-landing-reveal aria-hidden="true">
              <Image src="/logo-mark.svg" alt="" width={90} height={90} />
              <span className={styles.orbit}><i>FORM</i></span><span className={`${styles.orbit} ${styles.orbitTwo}`}><i>MATCHUP</i></span><span className={`${styles.orbit} ${styles.orbitThree}`}><i>VALUE</i></span>
            </div>
          </section>

          <section className={styles.features} id="tools">
            <div className={styles.featuresHeading} data-landing-reveal>
              <div><div className={`${styles.sectionIndex} ${styles.light}`}>02 — THE TOOLS</div><p className={`${styles.kicker} ${styles.lightKicker}`}>From team lists to full-time</p></div>
              <h2>See the game<br />from every angle</h2>
            </div>
            <div className={styles.featureGrid}>
              {features.map((feature) => <article className={styles.feature} key={feature.eyebrow} data-landing-reveal>
                <div className={styles.featureNumber}>{feature.number}</div><FeatureGraphic type={feature.graphic} />
                <div className={styles.featureCopy}><p>{feature.eyebrow}</p><h3>{feature.title}</h3><span>{feature.description}</span><Link href={feature.href}>Open {feature.eyebrow} <b>↗</b></Link></div>
              </article>)}
            </div>
          </section>

          <section className={styles.pricing} id="pricing">
            <div className={styles.pricingHeading} data-landing-reveal>
              <div><div className={styles.sectionIndex}>03 — PLANS</div><p className={styles.kicker}>Choose what suits your footy</p></div>
              <div><h2>Start free<br /><em>Go deeper when ready</em></h2><p>Get around the core app for free, then step up to Pro for fantasy and advanced stats or Premium for the complete betting toolkit</p></div>
            </div>
            <div className={styles.pricingGrid}>
              {plans.map((plan) => <article key={plan.name} className={`${styles.planCard} ${plan.featured ? styles.featuredPlan : ""}`} data-landing-reveal>
                {plan.featured ? <div className={styles.planBadge}>Best for fantasy + stats</div> : null}
                <div><p className={styles.planName}>{plan.name}</p><div className={styles.planPrice}>{plan.price}<span>{plan.suffix}</span></div><p className={styles.planDescription}>{plan.description}</p></div>
                <ul>{plan.features.map((feature) => <li key={feature}><span>✓</span>{feature}</li>)}</ul>
                <Link href={plan.href}>{plan.cta} <span>↗</span></Link>
              </article>)}
            </div>
          </section>

          <section className={styles.statement} id="about">
            <div className={styles.statementMark} aria-hidden="true">“</div>
            <blockquote data-landing-reveal>The numbers don&apos;t replace the footy<br /><em>They help you read it</em></blockquote>
            <p data-landing-reveal>Short Side is built for the fan who looks past the scoreboard — the fantasy coach, the punter and the rugby league tragic who wants the full picture before making the call</p>
          </section>

          <section className={styles.join}>
            <div className={styles.joinCopy} data-landing-reveal>
              <p className={`${styles.eyebrow} ${styles.centered}`}><span /> Start with free access</p>
              <h2>Go into the round<br /><em>with the full picture</em></h2>
              <p>Create an account and get around the core app, then upgrade when you want projections, advanced stats or betting models</p>
              <Link href="/sign-up" className={styles.joinButton}>Create free account <span>↗</span></Link>
            </div>
            <div className={styles.joinBall} aria-hidden="true" />
          </section>
        </LandingHeroScrollShell>
      </main>

      <footer className={styles.footer}>
        <Link href="/" className={styles.brand}><Image src="/logo-mark.svg" alt="" width={42} height={42} /><span><b>Short Side</b><strong>NRL</strong></span></Link>
        <p>Built for the game behind the game</p><p>© 2026 Short Side NRL</p>
      </footer>
    </div>
  )
}

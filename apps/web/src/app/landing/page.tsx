"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  FileSpreadsheet,
  LockKeyhole,
  MapPinned,
  Menu,
  Radio,
  Route,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import "./landing.css";

const nav = [
  { label: "Product", href: "#product" },
  { label: "How it works", href: "#workflow" },
  { label: "For teams", href: "#teams" },
  { label: "FAQ", href: "#faq" },
];

const questions = [
  {
    question: "Can officers work without mobile data?",
    answer:
      "After signing in and loading their assigned queue online, officers can save eligible outcomes on the device. Pace sends them when the API is reachable again and shows whether each event synced, conflicted, or was rejected. A fresh offline restart requires online session verification.",
  },
  {
    question: "How are daily accounts assigned?",
    answer:
      "Pace checks branch membership, active officer status, pincode coverage, account count, outstanding exposure, and high-DPD workload. Existing valid assignments are retained. Accounts without eligible coverage remain unassigned for manager review.",
  },
  {
    question: "Is the priority score an automatic decision?",
    answer:
      "No. The score is advisory, with three feature-grounded reasons. A manager can change operational order with a recorded rationale while the original model output remains available for audit. The current model is trained on synthetic demonstration history.",
  },
  {
    question: "Does a reported payment change the loan balance?",
    answer:
      "No. PAID records an officer's report. Authoritative outstanding amounts change only through a validated loan snapshot, not from a field outcome or a mock settlement.",
  },
  {
    question: "When can a borrower be contacted through Pace?",
    answer:
      "In-app borrower contact initiation is checked on the server from 08:00 inclusive to 19:00 exclusive in Asia/Kolkata. Allowed and blocked attempts are audited. Pace cannot control calls made outside the application.",
  },
  {
    question: "Can I connect Pace to our loan system or messaging provider?",
    answer:
      "The current demo uses synthetic portfolio data and CSV imports. LOS integration, verified payment reconciliation, and live SMS or WhatsApp delivery are later integration steps; reminder delivery in this build is explicitly simulated.",
  },
];

function Wordmark() {
  return (
    <Link className="lp-wordmark" href="/landing" aria-label="Pace home">
      <span className="lp-mark">P</span>
      <span>pace</span>
    </Link>
  );
}

function Action({
  href,
  children,
  secondary = false,
}: {
  href: string;
  children: React.ReactNode;
  secondary?: boolean;
}) {
  return (
    <Link
      className={`lp-action ${secondary ? "lp-action-secondary" : ""}`}
      href={href}
    >
      {children}{" "}
      {secondary ? <ArrowDownRight size={18} /> : <ArrowUpRight size={18} />}
    </Link>
  );
}

function BrowserFrame({
  src,
  alt,
  className = "",
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return (
    <div className={`lp-browser ${className}`}>
      <div className="lp-browser-bar" aria-hidden="true">
        <span className="lp-browser-dots">
          <i />
          <i />
          <i />
        </span>
        <span className="lp-browser-address">
          <LockKeyhole size={11} /> Pace workspace
        </span>
        <span className="lp-browser-spacer" />
      </div>
      <div className="lp-browser-window">
        <Image
          src={src}
          alt={alt}
          width={1280}
          height={2317}
          priority={src.includes("manager")}
        />
      </div>
    </div>
  );
}

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="pace-landing" id="top">
      <header className="lp-header lp-container">
        <Wordmark />
        <nav
          className={`lp-nav ${menuOpen ? "open" : ""}`}
          aria-label="Main navigation"
        >
          {nav.map((item) => (
            <a
              key={item.href}
              href={item.href}
              onClick={() => setMenuOpen(false)}
            >
              {item.label}
            </a>
          ))}
          <Link
            className="lp-mobile-signin"
            href="/login"
            onClick={() => setMenuOpen(false)}
          >
            Sign in
          </Link>
        </nav>
        <div className="lp-header-actions">
          <Link className="lp-signin" href="/login">
            Sign in
          </Link>
          <Link className="lp-header-cta" href="/login">
            Explore the product <ArrowUpRight size={16} />
          </Link>
        </div>
        <button
          className="lp-menu-button"
          type="button"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? <X size={23} /> : <Menu size={23} />}
        </button>
      </header>

      <main>
        <section className="lp-hero lp-container" aria-labelledby="lp-title">
          <div className="lp-hero-copy">
            <p className="lp-eyebrow">
              FIELD COLLECTIONS, INTELLIGENTLY PRIORITISED
            </p>
            <h1 id="lp-title">
              A clearer route to <span>every collection.</span>
            </h1>
            <p className="lp-hero-sub">
              Turn daily overdue files into focused officer queues, auditable
              field work, and a live view of your branch.
            </p>
            <div className="lp-actions">
              <Action href="/login">Explore the product</Action>
              <Action href="#workflow" secondary>
                See the workflow
              </Action>
            </div>
            <div className="lp-hero-proof">
              <p>Built for branch teams and field officers</p>
              <div className="lp-hero-numbers">
                <div>
                  <strong>4,800</strong>
                  <span>loans</span>
                </div>
                <div>
                  <strong>55</strong>
                  <span>field officers</span>
                </div>
                <div>
                  <strong>1</strong>
                  <span>connected workflow</span>
                </div>
              </div>
              <small>Designed around an Indore NBFC operating brief.</small>
            </div>
          </div>
          <div className="lp-hero-media">
            <div className="lp-media-halo" aria-hidden="true" />
            <BrowserFrame
              src="/pace-manager-overview.png"
              alt="Actual Pace manager overview showing the overdue portfolio, roll-rate trend, field operations, and officer workload"
              className="lp-hero-browser"
            />
            <div className="lp-media-note">
              <Radio size={15} /> Real Pace interface · synthetic demo data
            </div>
          </div>
        </section>

        <section
          className="lp-cloud lp-container"
          aria-label="Connected operations"
        >
          <p>One place for the handoffs that happen every day</p>
          <div className="lp-cloud-grid">
            {[
              "Portfolio",
              "Branches",
              "Officers",
              "Promises",
              "Activity",
              "Review",
            ].map((item, index) => (
              <div key={item} className="lp-cloud-mark">
                <span>{String(index + 1).padStart(2, "0")}</span>
                {item}
              </div>
            ))}
          </div>
        </section>

        <section className="lp-section lp-features lp-container" id="product">
          <div className="lp-section-intro">
            <p className="lp-eyebrow">THE PRODUCT</p>
            <h2>A daily collections system built around the work.</h2>
            <p>
              Import what the branch knows. Show officers what matters. Keep a
              trace of what happens next.
            </p>
          </div>
          <div className="lp-feature-row">
            <div className="lp-feature-media lp-feature-import">
              <BrowserFrame
                src="/pace-import-preview.png"
                alt="Actual Pace CSV import preview with validated rows and import history"
              />
            </div>
            <div className="lp-feature-copy">
              <span className="lp-feature-index">01 / DAILY INPUT</span>
              <FileSpreadsheet size={24} />
              <h3>From overdue file to a reliable morning view.</h3>
              <p>
                Managers preview a CSV before it writes dated loan snapshots.
                Duplicate rows, invalid values, and conflicting same-day records
                are visible before confirmation.
              </p>
              <a href="#workflow">
                Follow the daily flow <ArrowRight size={17} />
              </a>
            </div>
          </div>
          <div className="lp-feature-row lp-feature-reverse" id="teams">
            <div className="lp-feature-media lp-feature-phone">
              <div className="lp-phone">
                <Image
                  src="/pace-officer-today.png"
                  alt="Actual Pace officer Today queue showing prioritized accounts, outstanding amounts and DPD"
                  width={375}
                  height={2738}
                />
              </div>
              <div className="lp-phone-caption">
                <MapPinned size={17} /> A short queue built for field work
              </div>
            </div>
            <div className="lp-feature-copy">
              <span className="lp-feature-index">02 / FIELD EXECUTION</span>
              <Route size={24} />
              <h3>The next account is clear, even when the signal is not.</h3>
              <p>
                Each officer sees only their assigned work, with amounts, DPD,
                priority reasons, and promise context. Eligible outcomes save to
                the device first and synchronize when service returns.
              </p>
              <a href="/login">
                Open the officer demo <ArrowRight size={17} />
              </a>
            </div>
          </div>
          <div className="lp-feature-row">
            <div className="lp-feature-media lp-feature-review">
              <div className="lp-review-mock">
                <span className="lp-review-kicker">
                  ILLUSTRATIVE MANAGER REVIEW
                </span>
                <div className="lp-review-heading">
                  <h4>Human judgment stays in the loop.</h4>
                  <span>AI ADVISORY</span>
                </div>
                <div className="lp-review-score">
                  <strong>78</strong>
                  <div>
                    <b>High attention</b>
                    <small>
                      Three grounded reasons, with a retained model version.
                    </small>
                  </div>
                </div>
                <ul>
                  <li>
                    <Check size={15} /> Outstanding exposure is above portfolio
                    norm
                  </li>
                  <li>
                    <Check size={15} /> DPD is increasing in the early-arrears
                    cohort
                  </li>
                  <li>
                    <Check size={15} /> Previous promise needs follow-up
                  </li>
                </ul>
                <div className="lp-review-foot">
                  Manager ordering override <ArrowUpRight size={17} />
                </div>
              </div>
            </div>
            <div className="lp-feature-copy">
              <span className="lp-feature-index">03 / BRANCH OVERSIGHT</span>
              <Sparkles size={24} />
              <h3>Explain the recommendation. Record the decision.</h3>
              <p>
                The priority model is advisory and trained on synthetic
                demonstration history. Managers can inspect its reasons, adjust
                operational ordering with a rationale, and see the original
                score preserved.
              </p>
              <a href="#faq">
                How the model is used <ArrowRight size={17} />
              </a>
            </div>
          </div>
        </section>

        <section className="lp-section lp-process lp-container" id="workflow">
          <div className="lp-section-intro">
            <p className="lp-eyebrow">HOW IT WORKS</p>
            <h2>Three handoffs, one visible record.</h2>
            <p>
              What was once reconstructed from spreadsheets and messages becomes
              a branch workflow you can inspect.
            </p>
          </div>
          <div className="lp-process-grid">
            <article>
              <span>01</span>
              <FileSpreadsheet size={28} />
              <h3>Validate the day</h3>
              <p>
                Review the overdue CSV, confirm clean rows, and retain dated
                snapshots for historical analysis.
              </p>
            </article>
            <article>
              <span>02</span>
              <Route size={28} />
              <h3>Focus the route</h3>
              <p>
                Assign by coverage and workload. Officers see a short, explained
                queue for today.
              </p>
            </article>
            <article>
              <span>03</span>
              <ShieldCheck size={28} />
              <h3>Close the loop</h3>
              <p>
                Log outcomes and promises, sync field work, and surface
                exceptions in the manager view.
              </p>
            </article>
          </div>
        </section>

        <section
          className="lp-section lp-voices lp-container"
          aria-labelledby="lp-voices-title"
        >
          <div className="lp-section-intro">
            <p className="lp-eyebrow">FROM THE WORKFLOW</p>
            <h2 id="lp-voices-title">What each role needs to know.</h2>
            <p>
              Illustrative voices from Pace’s synthetic demo scenario. These are
              not customer endorsements.
            </p>
          </div>
          <div className="lp-voice-grid">
            <blockquote className="lp-voice-lead">
              <span>“</span>
              <p>
                I can see which accounts need attention first, why they are in
                my queue, and whether my work has reached the branch.
              </p>
              <footer>
                <span className="lp-voice-avatar" aria-hidden="true">
                  RC
                </span>
                <span>
                  <b>Rahul Chouhan</b>
                  <small>Field officer · illustrative scenario</small>
                </span>
              </footer>
            </blockquote>
            <blockquote>
              <span>“</span>
              <p>
                A broken promise should appear in today’s exceptions, not in
                next week’s spreadsheet.
              </p>
              <footer>
                <span className="lp-voice-avatar" aria-hidden="true">
                  BM
                </span>
                <span>
                  <b>Branch manager</b>
                  <small>Illustrative scenario</small>
                </span>
              </footer>
            </blockquote>
            <blockquote>
              <span>“</span>
              <p>
                When an account changes hands, the reason and the earlier field
                record should remain visible.
              </p>
              <footer>
                <span className="lp-voice-avatar" aria-hidden="true">
                  OR
                </span>
                <span>
                  <b>Operations reviewer</b>
                  <small>Illustrative scenario</small>
                </span>
              </footer>
            </blockquote>
          </div>
        </section>

        <section className="lp-section lp-pricing lp-container" id="plans">
          <div className="lp-section-intro">
            <p className="lp-eyebrow">PILOT SCOPE</p>
            <h2>Start with the operating unit that matters.</h2>
            <p>
              These are illustrative deployment scopes, not published prices or
              a commercial offer.
            </p>
          </div>
          <div className="lp-plan-grid">
            <article>
              <span className="lp-plan-name">Pilot</span>
              <h3>One branch</h3>
              <p className="lp-plan-price">Custom scope</p>
              <p>
                Validate daily imports and field workflows with a focused team.
              </p>
              <ul>
                <li>
                  <Check size={16} /> Synthetic demo data
                </li>
                <li>
                  <Check size={16} /> Manager and officer roles
                </li>
                <li>
                  <Check size={16} /> Workflow review
                </li>
              </ul>
              <Link href="/login">
                Explore demo <ArrowUpRight size={17} />
              </Link>
            </article>
            <article className="lp-plan-featured">
              <span className="lp-plan-name">Suggested evaluation</span>
              <h3>Branch rollout</h3>
              <p className="lp-plan-price">Custom scope</p>
              <p>
                Assess assignment balance, promises, offline work, and
                auditability together.
              </p>
              <ul>
                <li>
                  <Check size={16} /> Daily portfolio operations
                </li>
                <li>
                  <Check size={16} /> Officer field queue
                </li>
                <li>
                  <Check size={16} /> Branch analytics and review
                </li>
              </ul>
              <Link href="/login">
                Explore demo <ArrowUpRight size={17} />
              </Link>
            </article>
            <article>
              <span className="lp-plan-name">Future scope</span>
              <h3>Multi-branch</h3>
              <p className="lp-plan-price">To be designed</p>
              <p>
                Extend after integration, privacy review, and a measured pilot.
              </p>
              <ul>
                <li>
                  <Check size={16} /> LOS integration
                </li>
                <li>
                  <Check size={16} /> Verified payments
                </li>
                <li>
                  <Check size={16} /> Provider messaging controls
                </li>
              </ul>
              <a href="#faq">
                Read the boundaries <ArrowRight size={17} />
              </a>
            </article>
          </div>
        </section>

        <section className="lp-section lp-faq lp-container" id="faq">
          <div className="lp-faq-intro">
            <p className="lp-eyebrow">QUESTIONS</p>
            <h2>Clear answers for a serious workflow.</h2>
            <p>
              What Pace does today, and where a real lender integration begins.
            </p>
          </div>
          <div className="lp-faq-list">
            {questions.map((item) => (
              <details key={item.question}>
                <summary>
                  {item.question}
                  <ChevronDown size={19} />
                </summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="lp-closing lp-container">
          <div>
            <p className="lp-eyebrow">PACE DEMO</p>
            <h2>Make the next field day easier to run.</h2>
            <p>
              Open the working synthetic demo and see how a daily file becomes a
              visible collections workflow.
            </p>
          </div>
          <div className="lp-closing-actions">
            <Action href="/login">Open the demo</Action>
            <Action href="#workflow" secondary>
              See the workflow
            </Action>
          </div>
        </section>
      </main>

      <footer className="lp-footer lp-container">
        <div className="lp-footer-top">
          <div className="lp-footer-brand">
            <Wordmark />
            <p>Field collections, intelligently prioritised.</p>
            <small>
              Built as a synthetic demonstration for an Indore NBFC operating
              brief.
            </small>
          </div>
          <div className="lp-footer-links">
            <div>
              <b>Product</b>
              <a href="#product">Features</a>
              <a href="#workflow">Workflow</a>
              <a href="#plans">Pilot scope</a>
            </div>
            <div>
              <b>Explore</b>
              <Link href="/login">Manager demo</Link>
              <Link href="/login">Officer demo</Link>
              <a href="#faq">Questions</a>
            </div>
            <div>
              <b>Project</b>
              <a
                href="https://github.com/Aryan-coder06/Pace-Field-collections-intelligently-prioritised..git"
                target="_blank"
                rel="noreferrer"
              >
                GitHub <ArrowUpRight size={13} />
              </a>
              <a href="#top">Back to top</a>
            </div>
          </div>
        </div>
        <div className="lp-footer-bottom">
          <span>© {new Date().getFullYear()} Pace demo.</span>
          <span>
            Synthetic data · AI advisory · reminder delivery simulated
          </span>
        </div>
      </footer>
    </div>
  );
}

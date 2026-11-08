from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import BaseDocTemplate, Frame, Image, PageBreak, PageTemplate, Paragraph, Spacer, Table, TableStyle

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output/pdf/Technical_Design_Document.pdf"
SHOTS = ROOT / "apps/web/test-results/review"
pdfmetrics.registerFont(TTFont("Pace", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("PaceBold", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"))
INK, INDIGO, MUTED, LINE, PALE = map(colors.HexColor, ["#172033", "#3D4FC4", "#667085", "#E4E7EC", "#F5F6FB"])

base = getSampleStyleSheet()
title = ParagraphStyle("title", parent=base["Title"], fontName="PaceBold", fontSize=34, leading=39, textColor=INK, spaceAfter=10)
h1 = ParagraphStyle("h1", parent=base["Heading1"], fontName="PaceBold", fontSize=20, leading=25, textColor=INK, spaceBefore=7, spaceAfter=10)
h2 = ParagraphStyle("h2", parent=base["Heading2"], fontName="PaceBold", fontSize=12.5, leading=17, textColor=INDIGO, spaceBefore=10, spaceAfter=5)
body = ParagraphStyle("body", parent=base["BodyText"], fontName="Pace", fontSize=9.3, leading=14, textColor=INK, spaceAfter=7)
small = ParagraphStyle("small", parent=body, fontSize=8, leading=11, textColor=MUTED)
eyebrow = ParagraphStyle("eyebrow", parent=body, fontName="PaceBold", fontSize=8, leading=11, textColor=INDIGO, spaceAfter=5)
callout = ParagraphStyle("callout", parent=body, backColor=PALE, borderColor=LINE, borderWidth=0.5, borderPadding=9, leading=14)


def P(text, style=body):
    return Paragraph(text, style)


def footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(LINE)
    canvas.line(18 * mm, 14 * mm, 192 * mm, 14 * mm)
    canvas.setFont("Pace", 8)
    canvas.setFillColor(MUTED)
    canvas.drawString(18 * mm, 8.5 * mm, "PACE | TECHNICAL DESIGN DOCUMENT")
    canvas.drawRightString(192 * mm, 8.5 * mm, f"PAGE {doc.page}")
    canvas.restoreState()


def table(rows, widths, header=True):
    cells = [[P(str(cell), small) for cell in row] for row in rows]
    t = Table(cells, colWidths=widths, repeatRows=1 if header else 0, hAlign="LEFT")
    style = [("GRID", (0, 0), (-1, -1), 0.35, LINE), ("VALIGN", (0, 0), (-1, -1), "TOP"),
             ("LEFTPADDING", (0, 0), (-1, -1), 7), ("RIGHTPADDING", (0, 0), (-1, -1), 7),
             ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]
    if header:
        style += [("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#EEF0FF")), ("TEXTCOLOR", (0, 0), (-1, 0), INDIGO)]
    t.setStyle(TableStyle(style))
    return t


def flow(items):
    cells = [P(f"<b>{a}</b><br/><font color='#667085'>{b}</font>", small) for a, b in items]
    t = Table([cells], colWidths=[174 * mm / len(cells)] * len(cells))
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), PALE), ("BOX", (0, 0), (-1, -1), .5, LINE),
        ("INNERGRID", (0, 0), (-1, -1), .5, LINE), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7), ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8)]))
    return t


def shot(name, width=165 * mm, height=112 * mm):
    im = Image(str(SHOTS / name))
    ratio = min(width / im.imageWidth, height / im.imageHeight)
    im.drawWidth, im.drawHeight = im.imageWidth * ratio, im.imageHeight * ratio
    return im


def section(story, name):
    story.append(P(name, h1))


def build():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    doc = BaseDocTemplate(str(OUT), pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=18 * mm, bottomMargin=20 * mm)
    doc.addPageTemplates([PageTemplate(id="main", frames=[Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="main")], onPage=footer)])
    s = []
    s += [Spacer(1, 20 * mm), P("PACE", eyebrow), P("Technical Design<br/>Document", title),
          P("Field collections, intelligently prioritised.", ParagraphStyle("sub", parent=body, fontSize=14, leading=21, textColor=MUTED, spaceAfter=16)),
          P("A production-style, offline-first collections operating system for an RBI-registered NBFC serving small manufacturers and traders in Indore.", callout), Spacer(1, 12 * mm),
          table([["Repository", "https://github.com/Aryan-coder06/Pace-Field-collections-intelligently-prioritised..git"],
                 ["Live application", "Not deployed from this workspace. Hosting credentials and explicit authorization are required before publishing a synthetic demo."],
                 ["Build status", "Stage 4 hardening completed locally: API tests, browser journeys, lint, typecheck and production build verified."],
                 ["Data policy", "Synthetic borrowers, synthetic history, synthetic GPS examples and mock payment/reminder workflows only."]], [34 * mm, 140 * mm], False),
          Spacer(1, 12 * mm), P("Prepared for hackathon review - 8 November 2026", small), PageBreak()]

    section(s, "1. Executive summary")
    s += [P("Pace replaces the lender's daily overdue Excel and WhatsApp hand-off with a branch-scoped operating system. Managers validate an overdue file, retain dated snapshots, make explainable assignments and inspect operational performance. Field officers receive a concise risk-aware queue, record outcomes and promises, and preserve eligible work through poor connectivity."),
          P("The build favors correctness over surface complexity: monetary values are decimal-backed; snapshots are append-only; assignments and promises are versioned; consequential actions create audit records; and AI recommendations remain advisory and reversible."),
          P("Target client outcomes are reduced roll rates, same-day visit logging and removal of weekly Excel reconstruction. These are operational targets, not measured production claims.", callout), P("Core delivered", h2),
          table([["Capability", "Implemented outcome"], ["Collections lifecycle", "Validated CSV -> dated snapshot -> deterministic assignment -> outcome -> promise lifecycle -> analytics."],
                 ["Offline resilience", "User/branch scoped Dexie cache, durable outbox, per-event acknowledgement and visible conflicts."],
                 ["AI decision support", "Regularized logistic demonstration, grounded reasons, holdout metrics, back-test and audited rank override."],
                 ["Compliance", "Contact window, object-level RBAC, CSRF, audit ledger and synthetic-only data."]], [42 * mm, 132 * mm])]

    section(s, "2. Architecture")
    s += [P("Pace is a modular monolith. At approximately 55 officers and 4,800 loans, a single deployable FastAPI application with separated domains is more reliable and easier to operate than microservices."),
          flow([("Next.js PWA", "App Router, TanStack Query, Dexie outbox, shell cache"), ("FastAPI", "Auth, imports, assignments, collections, promises, analytics, sync, AI"), ("PostgreSQL", "Snapshots, versioned state, receipts and audit events")]), P("Key boundaries", h2),
          table([["Layer", "Responsibility", "Safety property"], ["Web", "Manager workspace and mobile officer workflow.", "Never labels a device save as server-synced."], ["API", "Authorization, validation, transactions and policy.", "Server derives actor and branch scope."], ["Database", "Projections plus append-only history.", "UUID receipts, versions and import guards."], ["Offline client", "Minimal cache and explicit outbox lifecycle.", "No tokens in IndexedDB; scoped cache."]], [30 * mm, 81 * mm, 63 * mm]),
          P("Why not microservices?", h2), P("Import, assignment, outcomes, promises and analytics require local transactions and common audit semantics. Domain seams remain clean for a future extraction, without introducing distributed operational failure modes now.")]

    section(s, "3. Data model and auditability")
    s += [P("Loan identity is separate from daily condition. LoanSnapshot is never overwritten by import processing; the loan/snapshot-date pair is unique. That preserves the history needed for roll-rate calculation and model training."),
          flow([("Branch / User", "role and branch scope"), ("Borrower / Loan", "stable synthetic identity"), ("LoanSnapshot", "dated DPD and balances"), ("Assignment", "versioned ownership"), ("Outcome / Promise", "field evidence and lifecycle"), ("Audit / Receipt", "immutable trace")]),
          table([["Entity", "Purpose", "Integrity control"], ["LoanSnapshot", "Dated outstanding, overdue and DPD.", "Unique loan + date; same-day conflicts require review."], ["Assignment", "Officer ownership for a business day.", "Active guard, branch/pincode checks and version."], ["CollectionOutcome", "Reported field result and location state.", "Immutable device event; PAID does not reduce outstanding."], ["PromiseTransition", "Commitment status history.", "One open promise; KEPT only through explicit mock verification."], ["SyncEventReceipt", "Server acknowledgement for client UUID.", "Unique event prevents duplicate replay."], ["AuditEvent", "Actor, branch, entity, action and metadata.", "Append-only operational trace."]], [39 * mm, 74 * mm, 61 * mm])]

    section(s, "4. Main workflows")
    s += [P("Daily import and assignment", h2), flow([("Upload", "UTF-8 and size limits"), ("Preview", "row errors and duplicates"), ("Confirm", "transactional snapshots"), ("Assign", "pincode + normalized cost"), ("Review", "exceptions and overrides")]),
          P("Assignment chooses the lowest normalized sum of account count, outstanding exposure and 30+ DPD accounts among active in-branch officers who cover the pincode. Stable user-ID tie-breaking is deterministic. Unsupported pincodes remain unassigned."),
          P("Officer outcome and promise", h2), flow([("Open account", "authorized assignment"), ("Select", "four outcome types"), ("Persist", "transaction + client UUID"), ("Promise", "same transaction"), ("Refresh", "queue, tracker, activity")]),
          P("DISPUTE requires explanation. PROMISE_TO_PAY requires positive amount and valid due date. PAID is only reported field evidence pending an authoritative settlement integration."),
          P("Offline synchronization", h2), flow([("Cache", "minimum authorized queue"), ("Outbox", "persist before UI success"), ("Health", "API reachability"), ("Sync", "batch UUID replay"), ("Resolve", "acknowledged/conflict/rejected")]),
          P("A persisted SYNCING event is replayed in foreground recovery. Server idempotency makes replay safe. A stale assignment becomes an ASSIGNMENT_REASSIGNED conflict rather than a force-applied outcome.", callout)]

    section(s, "5. AI architecture and governance")
    s += [P("The model is an explainable synthetic demonstration, not a production-calibrated financial model. It estimates roll-forward risk from stored snapshot transitions and informs an operational score. A manager's effective priority may change ordering while preserving original model evidence."),
          table([["Metric", "Measured synthetic holdout"], ["Model", "pace-logit-v2-1-20261107172635133161"], ["Observations / positives", "152 / 14"], ["Temporal split", "122 training / 30 validation"], ["ROC-AUC", "0.5972"], ["Accuracy / precision / recall", "0.7333 / 0.3333 / 0.3333"], ["Brier score", "0.1956"]], [70 * mm, 104 * mm]),
          P("Explanation and oversight", h2), table([["Concept", "Meaning"], ["Learned roll-risk estimate", "Probability-oriented output of the logistic model on available synthetic features."], ["Operational priority score", "Risk-aware score used to make officer work scannable."], ["Effective manager priority", "Versioned rank override with retained rationale; never overwrites model result."], ["Reasons", "Three largest positive standardized feature contributions expressed in controlled business language."]], [51 * mm, 123 * mm]),
          P("The synthetic cohort is small and validation performance is modest. Pace labels the output advisory, provides deterministic fallback and makes no claim of collection uplift or autonomous decision authority.", callout)]

    section(s, "6. UI/UX design")
    s += [P("The visual system uses a quiet near-white canvas, deep ink typography, restrained indigo actions, tabular financial numbers and thin separators. It avoids generic dashboard noise so operational signals remain legible outdoors and on low-end Android devices."), P("Officer Today at 375px", h2), shot("officer-375.png", 78 * mm, 130 * mm), P("The compact mobile queue keeps borrower, outstanding, DPD, reasons, promise context and the next action readable in seconds. Bottom navigation stays thumb reachable.", small), P("Manager overview", h2), shot("manager-overview.png", 165 * mm, 92 * mm), P("Import validation console", h2), shot("import-preview.png", 165 * mm, 105 * mm), PageBreak(), P("AI review and human control", h2), shot("ai-review.png", 165 * mm, 112 * mm), PageBreak()]

    section(s, "7. Security, privacy and compliance posture")
    s += [table([["Control", "Implemented behavior"], ["Authentication", "Argon2 password hashing, HttpOnly access/refresh cookies, refresh rotation and logout revocation."], ["Mutation protection", "Double-submit CSRF validation for cookie-authenticated mutations."], ["Authorization", "Backend role checks plus assignment/branch object scope; frontend routing is not the security boundary."], ["Contact policy", "Server-authoritative 08:00 inclusive to 19:00 exclusive Asia/Kolkata enforcement; blocked attempts audited."], ["Offline privacy", "No token in IndexedDB; minimal user/branch scoped cache; fresh offline restart cannot bypass authentication."], ["GPS", "Browser location status only; absent/low accuracy state is retained and never invented."], ["Data/messaging", "Synthetic records only; reminders are approved templates and simulated delivery."]], [44 * mm, 130 * mm]), P("Pace implements safeguards but does not claim RBI, DPDP or production compliance certification. Shared-device policy, managed-device controls, encryption-at-rest and incident operations require organization-level deployment work.", callout)]

    s += [PageBreak()]
    section(s, "8. Testing and validation")
    s += [P("All results below were executed locally during final hardening. Browser tests used a disposable PostgreSQL database, applied all migrations, seeded synthetic records and made real FastAPI requests."), table([["Check", "Result"], ["Backend pytest", "24 passed; one upstream Starlette TestClient deprecation warning."], ["Backend Ruff", "Passed."], ["Web ESLint / TypeScript", "Passed."], ["Playwright", "6 passed in 35.3 seconds."], ["Browser coverage", "360x800, 375x812, 430x932, 768x1024, 1280x800 and 1440x900; no horizontal document overflow."], ["Migration / seed", "Clean PostgreSQL migration through 0005_offline_ai and repeatable synthetic seed succeeded."]], [49 * mm, 125 * mm]), P("Browser journeys", h2), table([["Journey", "Verified result"], ["Manager", "CSV preview/confirmation, assignment override, audit visibility and AI rank override."], ["Officer", "Authorized loan detail, promise creation, immediate tracker update and GPS capture path."], ["Offline", "IndexedDB persistence, reconnection replay and exactly-once server outcome."], ["Conflict", "Manager reassignment produced retained audited conflict without former-officer outcome."], ["Reminder", "English/Hindi preview; delivery disabled outside contact window in this final run."]], [42 * mm, 132 * mm])]

    section(s, "9. Trade-offs and roadmap")
    s += [table([["Not a production capability", "Reasoned decision"], ["Bank settlement", "PAID remains a field report until verified reconciliation is integrated."], ["Real SMS/WhatsApp", "Simulated templates avoid uncontrolled borrower communication and provider-compliance work."], ["Universal Background Sync", "Foreground replay is the cross-browser contract."], ["Production ML claims", "Synthetic data demonstrates pipeline mechanics, not expected uplift."], ["Microservices/Kubernetes", "Unnecessary operational surface at the current scale."]], [74 * mm, 100 * mm]), P("Next: LOS and payment integration, privacy/security review, controlled provider messaging, real temporal model monitoring and a measured branch pilot.", body)]

    section(s, "10. Assumptions")
    s += [P("Client facts are distinguished from engineering assumptions in docs/ASSUMPTIONS.md."), table([["Range", "Summary"], ["001-005", "Officer/branch scope, business timezone, demo accounts and seeded priority framing."], ["006-010", "CSV contract, idempotency, pincode fallback, assignment cost and override policy."], ["011-020", "Promise lifecycle, payment meaning, contact/GPS behavior, roll-rate coverage and synthetic data."], ["021-026", "Offline authentication, cache scope, outbox retention, version conflicts and foreground sync."], ["027-031", "Synthetic model, holdout, grounded explanations, human override and controlled templates."], ["032-035", "Process-local rate limiting, SYNCING replay, Hindi boundary and deployment authorization."]], [35 * mm, 139 * mm]), P("No unknown production URL, benchmark or compliance claim has been invented for this submission.", callout)]
    doc.build(s)


if __name__ == "__main__":
    build()

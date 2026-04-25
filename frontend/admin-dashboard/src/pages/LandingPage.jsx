import { useState, useEffect, useRef } from "react";

// ── Google Fonts ──────────────────────────────────────────────────────────────
const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500;1,600&family=DM+Sans:wght@300;400;500;600&family=Libre+Baskerville:ital@1&display=swap');
`;

// ── Brand palette (matched to TRS shield logo) ────────────────────────────────
// Logo: deep navy shield, gold lettering/crown, forest-green lower band, white dove
const C = {
  navy:       "#0C2340",   // deep shield navy
  navyMid:    "#163459",
  navyLight:  "#1E4A7A",
  gold:       "#B8922A",   // logo gold
  goldMid:    "#D4A832",
  goldBright: "#EEC34A",
  goldPale:   "#FBF0CC",
  green:      "#1A5C3A",   // logo green band
  greenLight: "#226B47",
  cream:      "#F7F3EA",
  creamDark:  "#EDE8DA",
  white:      "#FFFFFF",
  text:       "#0E1C2E",
  muted:      "#68788D",
  border:     "#DDD8CE",
};

// ── Keyframe CSS ──────────────────────────────────────────────────────────────
const GLOBAL_CSS = `
${FONTS}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; }
body { font-family: 'DM Sans', sans-serif; color: ${C.text}; background: ${C.white}; overflow-x: hidden; }

@keyframes fadeUp   { from { opacity:0; transform:translateY(32px); } to { opacity:1; transform:translateY(0); } }
@keyframes fadeIn   { from { opacity:0; } to { opacity:1; } }
@keyframes ticker   { 0% { transform:translateX(0); } 100% { transform:translateX(-50%); } }
@keyframes carousel { 0% { transform:translateX(0); } 100% { transform:translateX(-50%); } }
@keyframes pulse    { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:.6; transform:scale(.8); } }
@keyframes shimmer  { 0% { background-position: -400px 0; } 100% { background-position: 400px 0; } }

.reveal { opacity:0; transform:translateY(28px); transition: opacity .7s cubic-bezier(.22,1,.36,1), transform .7s cubic-bezier(.22,1,.36,1); }
.reveal.visible { opacity:1 !important; transform:translateY(0) !important; }
.d1 { transition-delay:.1s; } .d2 { transition-delay:.2s; }
.d3 { transition-delay:.3s; } .d4 { transition-delay:.4s; }

.nav-link { position:relative; font-size:13.5px; font-weight:500; color:${C.text}; text-decoration:none; padding:8px 13px; border-radius:8px; transition:all .18s; display:block; }
.nav-link:hover { color:${C.navy}; background:rgba(12,35,64,.05); }
.dropdown { position:absolute; top:calc(100% + 10px); left:0; background:#fff; border:1px solid ${C.border}; border-radius:12px; padding:6px; min-width:210px; opacity:0; pointer-events:none; transform:translateY(-8px); transition:all .22s cubic-bezier(.22,1,.36,1); box-shadow:0 12px 48px rgba(12,35,64,.15); z-index:200; }
.has-drop:hover .dropdown { opacity:1; pointer-events:all; transform:translateY(0); }
.dropdown a { display:flex; align-items:center; gap:10px; font-size:13px; color:${C.text}; padding:9px 12px; border-radius:8px; transition:background .15s; text-decoration:none; }
.dropdown a:hover { background:${C.cream}; color:${C.navy}; }

.prog-card:hover .prog-arrow { background:${C.gold}; color:#fff; }
.news-featured:hover .news-bg { transform:scale(1.04); }
.portal-card:hover { border-color:${C.goldMid}; box-shadow:0 6px 24px rgba(184,134,42,.14); transform:translateY(-3px); }
.portal-card:hover .portal-bar { transform:scaleX(1); }
.why-card:hover { border-color:rgba(184,134,42,.22); box-shadow:0 12px 40px rgba(184,134,42,.1); transform:translateY(-5px); }
.why-card:hover .why-bar { transform:scaleX(1); }
.news-item:hover { transform:translateX(5px); border-color:rgba(184,134,42,.3); box-shadow:0 4px 16px rgba(184,134,42,.08); }
.news-item:hover .ni-accent { width:3px; }
.testi-track:hover { animation-play-state:paused; }
.event-card:hover { transform:translateY(-5px); box-shadow:0 16px 48px rgba(12,35,64,.13); border-color:transparent; }
.social-link:hover { background:${C.gold}; color:${C.navy}; border-color:${C.gold}; }
.foot-link:hover { color:${C.goldBright}; }
.qlink:hover { color:${C.goldBright}; background:rgba(255,255,255,.04); padding-left:1.25rem; }
.qlink:hover .qa { opacity:.9; transform:translateX(4px); }
`;

// ── Tiny helpers ──────────────────────────────────────────────────────────────
const useReveal = () => {
  useEffect(() => {
    const els = document.querySelectorAll(".reveal");
    const io = new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add("visible"); io.unobserve(e.target); } }), { threshold: 0.1 });
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);
};

const useCounter = (end, duration = 1800) => {
  const [val, setVal] = useState(0);
  const ref = useRef(null);
  const started = useRef(false);
  useEffect(() => {
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started.current) {
        started.current = true;
        const t0 = performance.now();
        const tick = now => { const p = Math.min((now - t0) / duration, 1); setVal(Math.round(p * end)); if (p < 1) requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
      }
    }, { threshold: .5 });
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, [end, duration]);
  return { val, ref };
};

// ── Logo (actual URL) ─────────────────────────────────────────────────────────
const LOGO_URL = "/assets/logo.jpeg";
// ══════════════════════════════════════════════════════════════════════════════
// TOPBAR
// ══════════════════════════════════════════════════════════════════════════════
const Topbar = () => (
  <div style={{ background: C.navy, color: "rgba(255,255,255,.65)", fontSize: 12, padding: "7px 0", letterSpacing: ".025em" }}>
    <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 2.5rem", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
      <div style={{ display: "flex", gap: "1.5rem" }}>
        <span>📞 +233 30 000 0000</span>
        <span>✉ info@topridgeschool.edu.gh</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "1.25rem" }}>
        {["Admissions","Alumni","Contact"].map((l, i) => (
          <span key={l} style={{ display: "flex", alignItems: "center", gap: "1.25rem" }}>
            {i > 0 && <span style={{ width: 1, height: 12, background: "rgba(255,255,255,.18)", display: "inline-block" }} />}
            <a href={`/${l.toLowerCase()}`} style={{ color: "rgba(255,255,255,.65)", textDecoration: "none", transition: "color .2s" }}
              onMouseEnter={e => e.target.style.color = C.goldBright}
              onMouseLeave={e => e.target.style.color = "rgba(255,255,255,.65)"}
            >{l}</a>
          </span>
        ))}
        <span style={{ background: C.gold, color: C.navy, fontSize: 10, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", padding: "2px 9px", borderRadius: 99 }}>
          2026 Intake Open
        </span>
      </div>
    </div>
  </div>
);

// ══════════════════════════════════════════════════════════════════════════════
// NAVBAR
// ══════════════════════════════════════════════════════════════════════════════
const NAV = [
  { label: "Home", href: "/" },
  { label: "About Us", href: "/about" },
  { label: "Academics", href: "/academics", drop: [
    { icon: "🌱", label: "Nursery / KG", href: "/nursery-kg" },
    { icon: "📖", label: "Primary (B1–6)", href: "/primary" },
    { icon: "🎓", label: "Junior High (B7–9)", href: "/jhs" },
    { icon: "📋", label: "Curriculum", href: "/curriculum" },
  ]},
  { label: "News & Events", href: "/news" },
  { label: "Gallery", href: "/gallery" },
  { label: "Achievements", href: "/achievements", drop: [
    { icon: "🏆", label: "Results 2025", href: "/results-2025" },
    { icon: "📊", label: "Results 2024", href: "/results-2024" },
    { icon: "📊", label: "Results 2023", href: "/results-2023" },
  ]},
  { label: "Why Join Us", href: "/why-us" },
];

const Navbar = () => {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", fn);
    return () => window.removeEventListener("scroll", fn);
  }, []);

  const btnStyle = (variant) => ({
    display: "inline-flex", alignItems: "center", gap: 6,
    padding: "9px 20px", borderRadius: 9, fontSize: 13.5, fontWeight: 600,
    textDecoration: "none", transition: "all .22s", fontFamily: "'DM Sans',sans-serif",
    cursor: "pointer", border: "none",
    ...(variant === "ghost" ? { background: "transparent", border: `1.5px solid ${C.border}`, color: C.navy } :
        variant === "gold"  ? { background: `linear-gradient(135deg,${C.gold},${C.goldMid})`, color: "#fff" } : {}),
  });

  return (
    <nav style={{
      position: "sticky", top: 0, zIndex: 100,
      background: scrolled ? "rgba(255,255,255,.96)" : "rgba(255,255,255,.96)",
      backdropFilter: "blur(14px)",
      borderBottom: `1px solid ${C.border}`,
      boxShadow: scrolled ? "0 2px 32px rgba(12,35,64,.1)" : "none",
      transition: "box-shadow .3s",
    }}>
      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 2.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", height: 70 }}>
        {/* Logo */}
        <a href="/" style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none" }}>
          <img src={LOGO_URL} alt="Top Ridge School" style={{ width: 48, height: 48, objectFit: "contain", borderRadius: 6 }} />
          <div>
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 17, fontWeight: 700, color: C.navy, lineHeight: 1.1 }}>Top Ridge School</div>
            <div style={{ fontSize: 9.5, color: C.gold, letterSpacing: ".16em", fontWeight: 600, textTransform: "uppercase", marginTop: 2 }}>Excellence · Character · Purpose</div>
          </div>
        </a>

        {/* Links */}
        <ul style={{ display: "flex", alignItems: "center", gap: 2, listStyle: "none" }}>
          {NAV.map(n => (
            <li key={n.label} className={n.drop ? "has-drop" : ""} style={{ position: "relative" }}>
              <a href={n.href} className="nav-link">{n.label}{n.drop ? " ▾" : ""}</a>
              {n.drop && (
                <div className="dropdown">
                  {n.drop.map(d => (
                    <a key={d.href} href={d.href}>
                      <span style={{ width: 24, height: 24, borderRadius: 6, background: "rgba(12,35,64,.06)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0 }}>{d.icon}</span>
                      {d.label}
                    </a>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>

        <div style={{ display: "flex", gap: 10 }}>
          <a href="/login" style={btnStyle("ghost")}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.navy; e.currentTarget.style.background = "rgba(12,35,64,.04)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = "transparent"; }}
          >Portal Login</a>
          <a href="/admissions" style={btnStyle("gold")}
            onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = `0 8px 24px rgba(184,134,42,.4)`; }}
            onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = ""; }}
          >Apply Now</a>
        </div>
      </div>
    </nav>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// HERO
// ══════════════════════════════════════════════════════════════════════════════
const SLIDES = [
  "/assets/hero1.png",
  "/assets/hero2.png",
  "/assets/hero3.png",
];
const QUICK = [
  { icon: "🎓", label: "Student Portal — Results & Fees", href: "/portal/student" },
  { icon: "📋", label: "Teacher Portal — Marks & Attendance", href: "/portal/teacher" },
  { icon: "📝", label: "Online Admission Application", href: "/admissions" },
  { icon: "📢", label: "Latest News & Announcements", href: "/news" },
  { icon: "🏆", label: "2025 Examination Results", href: "/results-2025" },
];

const Hero = () => {
  const [cur, setCur] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setCur(v => (v + 1) % SLIDES.length), 5500);
    return () => clearInterval(t);
  }, []);

  return (
    <section style={{ position: "relative", minHeight: "93vh", display: "flex", alignItems: "center", background: C.navy, overflow: "hidden" }}>
      {/* Slides */}
      {SLIDES.map((s, i) => (
        <div key={i} style={{
          position: "absolute", inset: 0, zIndex: 0,
          backgroundImage: `url(${s})`, backgroundSize: "cover", backgroundPosition: "center",
          opacity: i === cur ? 1 : 0,
          transform: i === cur ? "scale(1)" : "scale(1.05)",
          transition: "opacity 1.4s ease, transform 8s ease",
        }} />
      ))}
      {/* Overlay */}
      <div style={{ position: "absolute", inset: 0, zIndex: 1, background: "linear-gradient(115deg,rgba(12,35,64,.93) 0%,rgba(12,35,64,.7) 50%,rgba(12,35,64,.3) 100%)" }} />
      {/* Gold side accent */}
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: `linear-gradient(to bottom,transparent,${C.goldMid},transparent)`, opacity: .7, zIndex: 2 }} />

      {/* Content */}
      <div style={{ position: "relative", zIndex: 3, maxWidth: 1240, margin: "0 auto", padding: "0 2.5rem", display: "grid", gridTemplateColumns: "1fr 420px", gap: "4rem", alignItems: "center", width: "100%" }}>
        {/* Text */}
        <div style={{ color: "#fff", animation: "fadeUp .9s ease both" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 10, background: "rgba(184,134,42,.18)", border: `1px solid rgba(236,195,74,.35)`, borderRadius: 99, padding: "7px 18px", fontSize: 11, letterSpacing: ".14em", fontWeight: 600, color: C.goldBright, textTransform: "uppercase", marginBottom: "1.75rem" }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: C.goldBright, animation: "pulse 2s ease-in-out infinite", display: "inline-block" }} />
            Accra, Ghana — Est. 2005
          </div>

          <h1 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(3rem,5.5vw,5rem)", fontWeight: 700, lineHeight: 1.04, marginBottom: "1rem", letterSpacing: "-.01em" }}>
            Raising<br /><em style={{ fontStyle: "italic", color: C.goldBright, fontWeight: 500 }}>Leaders</em> of<br />Tomorrow
          </h1>

          <div style={{ width: 72, height: 2, background: `linear-gradient(to right,${C.gold},transparent)`, marginBottom: "1.5rem" }} />

          <p style={{ fontSize: "1.05rem", color: "rgba(255,255,255,.72)", lineHeight: 1.78, marginBottom: "2.5rem", fontWeight: 300, maxWidth: 500 }}>
            Top Ridge School delivers world-class education from Nursery through JHS, nurturing every child's academic excellence, character, and God-given purpose in the heart of Accra.
          </p>

          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "3.5rem" }}>
            {[
              { label: "Apply for Admission", style: { background: `linear-gradient(135deg,${C.gold},${C.goldMid})`, color: "#fff", boxShadow: `0 8px 24px rgba(184,134,42,.4)` }},
              { label: "Explore the School", style: { background: "rgba(255,255,255,.1)", color: "#fff", border: "1.5px solid rgba(255,255,255,.25)" }},
            ].map(b => (
              <a key={b.label} href="/admissions" style={{ display: "inline-flex", alignItems: "center", padding: "13px 28px", borderRadius: 10, fontSize: 14, fontWeight: 600, textDecoration: "none", transition: "all .22s", fontFamily: "'DM Sans',sans-serif", ...b.style }}
                onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; }}
                onMouseLeave={e => { e.currentTarget.style.transform = ""; }}
              >{b.label}</a>
            ))}
          </div>

          {/* Stats */}
          <div style={{ display: "flex", gap: "2.5rem", paddingTop: "2rem", borderTop: "1px solid rgba(255,255,255,.12)" }}>
            {[{ n: "800+", l: "Students" }, { n: "60+", l: "Educators" }, { n: "98%", l: "BECE Pass Rate" }].map(s => (
              <div key={s.l}>
                <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "2.2rem", fontWeight: 700, color: "#fff", lineHeight: 1 }}>{s.n}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,.5)", letterSpacing: ".07em", textTransform: "uppercase", marginTop: 4 }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Access Card */}
        <div style={{ background: "rgba(255,255,255,.06)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,.12)", borderRadius: 20, overflow: "hidden", animation: "fadeUp .9s .2s ease both", opacity: 0, animationFillMode: "forwards" }}>
          <div style={{ background: "rgba(255,255,255,.06)", padding: "1.25rem 1.75rem", borderBottom: "1px solid rgba(255,255,255,.08)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "1.15rem", fontWeight: 600, color: "#fff" }}>Quick Access</span>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: C.goldBright, background: "rgba(240,192,64,.15)", border: `1px solid rgba(240,192,64,.25)`, padding: "3px 10px", borderRadius: 99 }}>Live</span>
          </div>
          <div style={{ padding: "0.5rem 1.25rem 1rem" }}>
            {QUICK.map(q => (
              <a key={q.href} href={q.href} className="qlink" style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0.5rem", borderBottom: "1px solid rgba(255,255,255,.07)", textDecoration: "none", color: "rgba(255,255,255,.8)", fontSize: 13.5, transition: "all .2s", borderRadius: 8 }}>
                <span style={{ width: 34, height: 34, borderRadius: 8, background: "rgba(255,255,255,.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 }}>{q.icon}</span>
                <span>{q.label}</span>
                <span className="qa" style={{ marginLeft: "auto", fontSize: 12, opacity: .4, transition: "all .2s" }}>→</span>
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* Dots */}
      <div style={{ position: "absolute", bottom: "2.5rem", left: "50%", transform: "translateX(-50%)", display: "flex", gap: 8, zIndex: 4 }}>
        {SLIDES.map((_, i) => (
          <button key={i} onClick={() => setCur(i)} style={{ width: i === cur ? 32 : 8, height: 8, borderRadius: 4, border: "none", cursor: "pointer", background: i === cur ? C.gold : "rgba(255,255,255,.3)", transition: "all .3s" }} />
        ))}
      </div>

      {/* Scroll hint */}
      <div style={{ position: "absolute", bottom: "2.5rem", right: "3rem", zIndex: 4, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        <span style={{ color: "rgba(255,255,255,.35)", fontSize: 10, letterSpacing: ".15em", textTransform: "uppercase" }}>Scroll</span>
        <div style={{ width: 1.5, height: 44, background: "linear-gradient(to bottom,rgba(255,255,255,.3),transparent)" }} />
      </div>
    </section>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// TICKER
// ══════════════════════════════════════════════════════════════════════════════
const TICKS = ["Excellence in Education","2025 BECE Results Released","Admissions Open — Term 1 2026","Inter-School Sports Day","Top Ridge Model UN Club","Parent-Teacher Meeting — April 5","100% BECE Pass Rate — 3rd Year Running"];

const Ticker = () => (
  <div style={{ background: C.gold, padding: "11px 0", overflow: "hidden" }}>
    <div style={{ display: "flex", animation: "ticker 35s linear infinite", width: "max-content" }}>
      {[...TICKS, ...TICKS].map((t, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0 2rem", fontSize: 12.5, fontWeight: 600, color: C.navy, letterSpacing: ".06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
          {t}
          <span style={{ width: 4, height: 4, borderRadius: "50%", background: C.navy, opacity: .35 }} />
        </div>
      ))}
    </div>
  </div>
);

// ══════════════════════════════════════════════════════════════════════════════
// PORTAL STRIP
// ══════════════════════════════════════════════════════════════════════════════
const PORTALS = [
  { icon: "🛡️", label: "Portal", name: "Admin Login", href: "/portal/admin", bg: "rgba(12,35,64,.08)" },
  { icon: "📖", label: "Portal", name: "Teacher Login", href: "/portal/teacher", bg: "rgba(184,134,42,.1)" },
  { icon: "🎓", label: "Portal", name: "Student Login", href: "/portal/student", bg: "rgba(26,92,58,.1)" },
];

const PortalStrip = () => (
  <div style={{ background: C.cream, borderBottom: `1px solid ${C.border}`, padding: "1.75rem 0" }}>
    <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 2.5rem", display: "flex", justifyContent: "center", gap: "1.25rem", flexWrap: "wrap" }}>
      {PORTALS.map(p => (
        <a key={p.href} href={p.href} className="portal-card" style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: "1.1rem 1.5rem", display: "flex", alignItems: "center", gap: 12, textDecoration: "none", transition: "all .25s", minWidth: 170, position: "relative", overflow: "hidden" }}>
          <div className="portal-bar" style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(to right,${C.gold},${C.goldMid})`, transform: "scaleX(0)", transformOrigin: "left", transition: "transform .3s" }} />
          <div style={{ width: 38, height: 38, borderRadius: 9, background: p.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>{p.icon}</div>
          <div>
            <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: ".1em", fontWeight: 600 }}>{p.label}</div>
            <div style={{ fontSize: 14.5, fontWeight: 600, color: C.navy }}>{p.name}</div>
          </div>
        </a>
      ))}
    </div>
  </div>
);

// ══════════════════════════════════════════════════════════════════════════════
// SECTION HELPER
// ══════════════════════════════════════════════════════════════════════════════
const SLabel = ({ children }) => (
  <div style={{ display: "inline-flex", alignItems: "center", gap: 10, fontSize: 11, fontWeight: 700, letterSpacing: ".16em", textTransform: "uppercase", color: C.gold, marginBottom: "1rem" }}>
    <span style={{ width: 28, height: 2, background: C.gold, borderRadius: 1 }} />{children}
  </div>
);
const STitle = ({ children, light }) => (
  <h2 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(2rem,3.5vw,3rem)", fontWeight: 700, color: light ? C.white : C.navy, lineHeight: 1.1, letterSpacing: "-.01em" }}>{children}</h2>
);
const Btn = ({ children, href, variant = "navy", ...rest }) => {
  const styles = {
    navy:  { background: C.navy, color: "#fff" },
    gold:  { background: `linear-gradient(135deg,${C.gold},${C.goldMid})`, color: "#fff" },
    ghost: { background: "transparent", border: `1.5px solid ${C.border}`, color: C.navy },
    white: { background: C.white, color: C.green, fontWeight: 700 },
    outlineW: { background: "transparent", border: "1.5px solid rgba(255,255,255,.35)", color: "#fff" },
  };
  return (
    <a href={href} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "12px 26px", borderRadius: 10, fontSize: 14, fontWeight: 600, textDecoration: "none", transition: "all .22s", fontFamily: "'DM Sans',sans-serif", ...styles[variant], ...rest.style }}
      onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.opacity = ".9"; }}
      onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.opacity = "1"; }}
    >{children}</a>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// ABOUT
// ══════════════════════════════════════════════════════════════════════════════
const About = () => {
  useReveal();
  return (
    <section style={{ background: C.cream, padding: "6rem 0" }}>
      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 2.5rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6rem", alignItems: "center" }}>
        {/* Visual */}
        <div className="reveal" style={{ position: "relative", height: 500 }}>
          <div style={{ position: "absolute", top: 0, left: 0, width: "74%", height: "84%", borderRadius: 20, overflow: "hidden", background: `linear-gradient(150deg,${C.navyMid},${C.green})`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 20px 60px rgba(12,35,64,.2)" }}>
            <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "5rem", color: "rgba(255,255,255,.15)", fontWeight: 700, fontStyle: "italic" }}>TRS</span>
            {/* Year badge */}
            <div style={{ position: "absolute", top: "1.5rem", right: "1.5rem", background: C.navy, borderRadius: 12, padding: "14px 18px", textAlign: "center", boxShadow: "0 8px 28px rgba(12,35,64,.3)" }}>
              <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "1.9rem", fontWeight: 700, color: C.goldBright, lineHeight: 1 }}>2005</div>
              <div style={{ fontSize: 9, letterSpacing: ".14em", textTransform: "uppercase", color: "rgba(255,255,255,.5)", marginTop: 2 }}>Est.</div>
            </div>
          </div>
          <div style={{ position: "absolute", bottom: 0, right: 0, width: "52%", height: "52%", borderRadius: 20, background: `linear-gradient(135deg,${C.gold},${C.goldMid})`, display: "flex", alignItems: "center", justifyContent: "center", border: `4px solid ${C.cream}` }}>
            <span style={{ fontSize: "2.5rem", opacity: .3 }}>🏫</span>
            <div style={{ position: "absolute", bottom: -14, left: "50%", transform: "translateX(-50%)", background: C.white, border: `1px solid ${C.border}`, borderRadius: 99, padding: "7px 16px", fontSize: 11.5, fontWeight: 600, color: C.navy, whiteSpace: "nowrap", boxShadow: "0 4px 16px rgba(0,0,0,.08)" }}>
              📍 Accra, Ghana
            </div>
          </div>
          {/* Gold corner accent */}
          <div style={{ position: "absolute", top: -18, left: -18, width: 100, height: 100, borderRadius: 4, background: `linear-gradient(135deg,${C.gold},${C.goldMid})`, opacity: .12, zIndex: -1 }} />
        </div>

        {/* Text */}
        <div className="reveal d2">
          <SLabel>About Top Ridge</SLabel>
          <STitle>A Place Where <em style={{ fontStyle: "italic", color: C.gold, fontWeight: 500 }}>Every Child</em> Thrives</STitle>
          <p style={{ fontSize: "1rem", color: C.muted, lineHeight: 1.75, marginTop: "0.75rem", marginBottom: "2rem" }}>
            For two decades, Top Ridge School has been a cornerstone of quality education in Accra — combining rigorous academics with strong moral values to shape well-rounded, confident young people ready for the world.
          </p>
          {[
            { icon: "📚", title: "GES-Aligned Curriculum", desc: "Ghana Education Service accredited with enriched programmes" },
            { icon: "🏆", title: "Consistent Excellence", desc: "Top BECE performers district-wide, year after year" },
            { icon: "⛪", title: "Values-Based Learning", desc: "Character and faith woven into every part of school life" },
            { icon: "🌍", title: "Global Perspective", desc: "Preparing students for national and international success" },
          ].reduce((rows, item, i) => { if (i % 2 === 0) rows.push([]); rows[rows.length - 1].push(item); return rows; }, []).map((row, ri) => (
            <div key={ri} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem", marginBottom: "1.25rem" }}>
              {row.map(f => (
                <div key={f.title} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <div style={{ width: 34, height: 34, borderRadius: 8, background: "rgba(184,134,42,.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0, marginTop: 1 }}>{f.icon}</div>
                  <div>
                    <strong style={{ display: "block", fontSize: 13.5, color: C.text, fontWeight: 600, marginBottom: 2 }}>{f.title}</strong>
                    <span style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.55 }}>{f.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          ))}
          <Btn href="/about" variant="navy" style={{ marginTop: "1.5rem" }}>Learn More About Us</Btn>
        </div>
      </div>
    </section>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// PROGRAMMES
// ══════════════════════════════════════════════════════════════════════════════
const PROGS = [
  { emoji: "🌱", gradient: "linear-gradient(150deg,#F6AF3A,#F4845F)", level: "Foundation", name: "Nursery & Kindergarten", desc: "Play-based, child-centred learning that builds curiosity, social skills, and early literacy from the very first days of school.", ages: "Ages 2 – 6", href: "/nursery-kg" },
  { emoji: "📖", gradient: "linear-gradient(150deg,#22C55E,#0EA5E9)", level: "Primary", name: "Basic 1 – 6", desc: "Strong foundations in literacy, numeracy, science, and creative thinking across six formative years of guided exploration.", ages: "Ages 6 – 12", href: "/primary" },
  { emoji: "🎓", gradient: "linear-gradient(150deg,#3B82F6,#8B5CF6)", level: "Junior High", name: "Basic 7 – 9 (JHS)", desc: "Rigorous BECE preparation with leadership development, clubs, and career-readiness programmes for the future.", ages: "Ages 12 – 15", href: "/jhs" },
];

const Programmes = () => (
  <section style={{ background: C.white, padding: "6rem 0" }}>
    <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 2.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "3.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div className="reveal">
          <SLabel>Academic Programmes</SLabel>
          <STitle>Education at <em style={{ fontStyle: "italic", color: C.gold, fontWeight: 500 }}>Every Stage</em></STitle>
          <p style={{ fontSize: "1rem", color: C.muted, lineHeight: 1.75, marginTop: "0.75rem", maxWidth: 500 }}>From first steps to junior high — a seamless, nurturing academic journey.</p>
        </div>
        <Btn href="/academics" variant="ghost" style={{ flexShrink: 0 }}>View All Programmes</Btn>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "1.5rem" }}>
        {PROGS.map((p, i) => (
          <a key={p.href} href={p.href} className={`prog-card reveal ${i > 0 ? `d${i+1}` : ""}`} style={{ borderRadius: 20, overflow: "hidden", border: `1px solid ${C.border}`, textDecoration: "none", background: C.white, display: "block", position: "relative", transition: "all .35s" }}>
            <div style={{ height: 190, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "3.5rem", position: "relative", overflow: "hidden", background: p.gradient }}>
              <span style={{ position: "relative", zIndex: 1 }}>{p.emoji}</span>
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "50%", background: "linear-gradient(to top,rgba(12,35,64,.3),transparent)" }} />
            </div>
            <div style={{ padding: "1.6rem", paddingBottom: "3.5rem" }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: C.gold, marginBottom: 8 }}>{p.level}</div>
              <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "1.35rem", color: C.navy, marginBottom: 10, lineHeight: 1.25, fontWeight: 600 }}>{p.name}</div>
              <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.65, marginBottom: "1.25rem" }}>{p.desc}</div>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(12,35,64,.05)", borderRadius: 99, padding: "5px 14px", fontSize: 12, color: C.navy, fontWeight: 500 }}>{p.ages}</div>
            </div>
            <div className="prog-arrow" style={{ position: "absolute", bottom: "1.5rem", right: "1.5rem", width: 32, height: 32, borderRadius: "50%", background: "rgba(12,35,64,.06)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, transition: "all .3s" }}>→</div>
          </a>
        ))}
      </div>
    </div>
  </section>
);

// ══════════════════════════════════════════════════════════════════════════════
// STATS
// ══════════════════════════════════════════════════════════════════════════════
const StatItem = ({ end, suffix, label, icon, delay }) => {
  const { val, ref } = useCounter(end);
  return (
    <div ref={ref} className={`reveal ${delay}`} style={{ textAlign: "center", padding: "2.25rem 1.5rem", borderRight: `1px solid rgba(255,255,255,.08)`, position: "relative" }}>
      <div style={{ fontSize: "1.5rem", marginBottom: 12, opacity: .6 }}>{icon}</div>
      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "3.2rem", fontWeight: 700, color: "#fff", lineHeight: 1, letterSpacing: "-.02em" }}>
        {val}{suffix}
      </div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,.45)", marginTop: 8, letterSpacing: ".06em", textTransform: "uppercase" }}>{label}</div>
    </div>
  );
};

const Stats = () => (
  <div style={{ background: C.navy, padding: "4.5rem 0", position: "relative", overflow: "hidden" }}>
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(to right,transparent,${C.goldMid},${C.gold},${C.goldMid},transparent)` }} />
    <div style={{ position: "absolute", right: "-2%", top: "50%", transform: "translateY(-50%)", fontFamily: "'Cormorant Garamond',serif", fontSize: "10rem", fontWeight: 700, fontStyle: "italic", color: "rgba(255,255,255,.025)", letterSpacing: "-.05em", pointerEvents: "none", whiteSpace: "nowrap" }}>EXCELLENCE</div>
    <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 2.5rem", display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "2rem", position: "relative" }}>
      <StatItem end={800} suffix="+" label="Enrolled Students" icon="👥" delay="d1" />
      <StatItem end={98} suffix="%" label="BECE Pass Rate" icon="🏆" delay="d2" />
      <StatItem end={60} suffix="+" label="Qualified Staff" icon="👩‍🏫" delay="d3" />
      <StatItem end={20} suffix=" yrs" label="Years of Excellence" icon="⭐" delay="d4" />
    </div>
  </div>
);

// ══════════════════════════════════════════════════════════════════════════════
// NEWS
// ══════════════════════════════════════════════════════════════════════════════
const NEWS_ITEMS = [
  { tag: "Academics", title: "Class of 2025 Achieves 100% BECE Pass Rate — Third Consecutive Year", date: "November 20, 2025" },
  { tag: "Events", title: "Annual Founders' Day Celebration — Join Us on 12th April", date: "April 1, 2025" },
  { tag: "Community", title: "Top Ridge Model UN Club Places 2nd at National Conference", date: "February 17, 2025" },
  { tag: "Admissions", title: "2026 Admissions Now Open — Apply Before 28th February", date: "January 5, 2026" },
];

const News = () => (
  <section style={{ background: C.cream, padding: "6rem 0" }}>
    <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 2.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "3.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div className="reveal"><SLabel>Latest News</SLabel><STitle>What's Happening at <em style={{ fontStyle: "italic", color: C.gold, fontWeight: 500 }}>Top Ridge</em></STitle></div>
        <Btn href="/news" variant="ghost">All News</Btn>
      </div>
      <div className="reveal" style={{ display: "grid", gridTemplateColumns: "5fr 3fr", gap: "1.75rem" }}>
        {/* Featured */}
        <a href="/news/sports-day" className="news-featured" style={{ position: "relative", borderRadius: 20, overflow: "hidden", minHeight: 460, display: "flex", alignItems: "flex-end", textDecoration: "none", background: `linear-gradient(135deg,${C.navy},${C.green})` }}>
          <div className="news-bg" style={{ position: "absolute", inset: 0, backgroundImage: "url(https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800&q=80)", backgroundSize: "cover", backgroundPosition: "center", transition: "transform .7s" }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top,rgba(12,35,64,.95) 0%,rgba(12,35,64,.35) 55%,rgba(12,35,64,.1) 100%)" }} />
          <div style={{ position: "relative", zIndex: 1, padding: "2.5rem", color: "#fff" }}>
            <span style={{ display: "inline-block", background: C.gold, color: C.navy, fontSize: 10, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", padding: "4px 12px", borderRadius: 99, marginBottom: 14 }}>Sports</span>
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "1.7rem", fontWeight: 600, lineHeight: 1.2, marginBottom: 10 }}>Top Ridge Wins District Inter-Schools Athletics Championship 2025</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.5)", display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 16, height: 1, background: "rgba(255,255,255,.3)", display: "inline-block" }} />March 15, 2025</div>
          </div>
        </a>
        {/* List */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {NEWS_ITEMS.map(n => (
            <a key={n.title} href="#" className="news-item" style={{ background: C.white, borderRadius: 12, padding: "1.35rem", border: `1px solid ${C.border}`, textDecoration: "none", display: "block", position: "relative", overflow: "hidden", transition: "all .22s" }}>
              <div className="ni-accent" style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 0, background: `linear-gradient(to bottom,${C.gold},${C.goldMid})`, transition: "width .3s" }} />
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: C.gold, marginBottom: 7, paddingLeft: 4 }}>{n.tag}</div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: C.navy, lineHeight: 1.45, marginBottom: 5, paddingLeft: 4 }}>{n.title}</div>
              <div style={{ fontSize: 11.5, color: C.muted, paddingLeft: 4 }}>{n.date}</div>
            </a>
          ))}
        </div>
      </div>
    </div>
  </section>
);

// ══════════════════════════════════════════════════════════════════════════════
// EVENTS
// ══════════════════════════════════════════════════════════════════════════════
const EVENTS = [
  { day: "05", month: "Apr", type: "Community", name: "Parent-Teacher Conference", time: "8:00 AM – 2:00 PM", place: "School Assembly Hall" },
  { day: "12", month: "Apr", type: "School", name: "Founders' Day Celebration", time: "9:00 AM – 4:00 PM", place: "School Grounds" },
  { day: "28", month: "Apr", type: "Academics", name: "Term 2 Examinations Begin", time: "7:30 AM sharp", place: "All Classrooms" },
];

const Events = () => (
  <section style={{ background: C.white, padding: "6rem 0" }}>
    <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 2.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "3.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div className="reveal"><SLabel>Upcoming Events</SLabel><STitle>Mark Your <em style={{ fontStyle: "italic", color: C.gold, fontWeight: 500 }}>Calendar</em></STitle></div>
        <Btn href="/events" variant="ghost">View All Events</Btn>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "1.5rem" }}>
        {EVENTS.map((e, i) => (
          <div key={e.name} className={`event-card reveal ${i > 0 ? `d${i+1}` : ""}`} style={{ borderRadius: 20, border: `1px solid ${C.border}`, overflow: "hidden", transition: "all .25s" }}>
            <div style={{ background: C.navy, padding: "1.4rem 1.6rem", display: "flex", alignItems: "center", gap: "1.25rem", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", right: -20, top: -20, width: 80, height: 80, borderRadius: "50%", background: "rgba(255,255,255,.04)" }} />
              <div style={{ textAlign: "center", minWidth: 52, position: "relative", zIndex: 1 }}>
                <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "2.2rem", fontWeight: 700, color: "#fff", lineHeight: 1 }}>{e.day}</div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: C.goldBright }}>{e.month}</div>
              </div>
              <div style={{ width: 1, height: 48, background: "rgba(255,255,255,.1)", flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "rgba(255,255,255,.45)", marginBottom: 4 }}>{e.type}</div>
                <div style={{ fontSize: 14.5, fontWeight: 600, color: "#fff", lineHeight: 1.3 }}>{e.name}</div>
              </div>
            </div>
            <div style={{ padding: "1.4rem 1.6rem" }}>
              {[{ icon: "🕗", val: e.time }, { icon: "📍", val: e.place }].map(m => (
                <div key={m.val} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.muted, marginBottom: 8 }}>
                  <span style={{ width: 16, textAlign: "center", opacity: .6, fontSize: 13 }}>{m.icon}</span>
                  {m.val}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

// ══════════════════════════════════════════════════════════════════════════════
// TESTIMONIALS
// ══════════════════════════════════════════════════════════════════════════════
const TESTIS = [
  { q: "Top Ridge gave me the confidence to believe in myself. The teachers didn't just teach — they invested in us, challenged us, and celebrated every win.", name: "Abena Agyemang", role: "JHS 3 Graduate, 2025", init: "AA" },
  { q: "My favourite memories are from the science club and sports day. This school showed me that education is about more than just textbooks.", name: "Kweku Osei", role: "JHS 2 Student", init: "KO" },
  { q: "From KG through JHS, Top Ridge has been consistent — consistent in excellence, consistent in care. I am proud to call this my school.", name: "Nana Adwoa Asare", role: "Alumni, Class of 2024", init: "NA" },
  { q: "The values I learned here — integrity, hard work, and service — guide everything I do. Top Ridge planted those seeds deeply.", name: "Emmanuel Koomson", role: "Alumni, now at Presec", init: "EK" },
  { q: "As a parent, watching my children grow into confident, curious learners here has been the greatest gift. The teachers are extraordinary.", name: "Mrs. Mensah-Abban", role: "Parent of two Top Ridge students", init: "MA" },
];

const Testimonials = () => (
  <section style={{ background: C.navy, padding: "6rem 0", overflow: "hidden", position: "relative" }}>
    <div style={{ position: "absolute", top: -100, left: -100, width: 400, height: 400, borderRadius: "50%", background: "rgba(184,134,42,.05)", pointerEvents: "none" }} />
    <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 2.5rem", marginBottom: "3.5rem" }}>
      <div className="reveal" style={{ textAlign: "center" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 10, fontSize: 11, fontWeight: 700, letterSpacing: ".16em", textTransform: "uppercase", color: C.goldBright, marginBottom: "1rem" }}>
          <span style={{ width: 28, height: 2, background: C.goldBright, borderRadius: 1 }} />Student Voices<span style={{ width: 28, height: 2, background: C.goldBright, borderRadius: 1 }} />
        </div>
        <STitle light>What Our <em style={{ fontStyle: "italic", color: C.goldBright, fontWeight: 500 }}>Community Says</em></STitle>
      </div>
    </div>
    <div style={{ overflow: "hidden" }}>
      <div className="testi-track" style={{ display: "flex", gap: "1.5rem", animation: "carousel 45s linear infinite", width: "max-content" }}>
        {[...TESTIS, ...TESTIS].map((t, i) => (
          <div key={i} style={{ background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 20, padding: "2rem", minWidth: 330, flexShrink: 0, position: "relative" }}>
            <div style={{ position: "absolute", top: -10, left: "1.5rem", fontFamily: "'Cormorant Garamond',serif", fontSize: "6rem", color: "rgba(240,192,64,.15)", lineHeight: 1 }}>"</div>
            <p style={{ fontFamily: "'Libre Baskerville',serif", fontSize: ".95rem", color: "rgba(255,255,255,.8)", lineHeight: 1.75, marginBottom: "1.5rem", fontStyle: "italic", paddingTop: "0.5rem" }}>{t.q}</p>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 42, height: 42, borderRadius: "50%", background: `linear-gradient(135deg,${C.gold},${C.goldMid})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: C.navy, flexShrink: 0 }}>{t.init}</div>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: "#fff" }}>{t.name}</div>
                <div style={{ fontSize: 11.5, color: "rgba(255,255,255,.4)" }}>{t.role}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

// ══════════════════════════════════════════════════════════════════════════════
// WHY US
// ══════════════════════════════════════════════════════════════════════════════
const WHY = [
  { icon: "📐", title: "Academic Rigour", desc: "Our GES-aligned curriculum is enriched with additional programmes to stretch capable learners and support those who need extra care." },
  { icon: "🏟️", title: "Modern Facilities", desc: "Well-equipped science labs, a library, ICT centre, sports fields, and dedicated arts and music spaces support every dimension of learning." },
  { icon: "🤝", title: "Pastoral Care", desc: "Every student is known by name. Our pastoral team ensures each child feels safe, supported, and celebrated throughout their journey." },
  { icon: "🌐", title: "Digital Learning", desc: "Our school portal gives students and parents real-time access to results, fees, attendance, and announcements — any time, anywhere." },
  { icon: "⚽", title: "Sports & Arts", desc: "From football to debate club, model UN to choir — rich co-curricular activities build teamwork, creativity, and leadership beyond the classroom." },
  { icon: "🙏", title: "Values & Faith", desc: "Our Christian ethos and character-formation programmes shape young people with integrity, compassion, and a sense of purpose for life and service." },
];

const WhyUs = () => (
  <section style={{ background: C.cream, padding: "6rem 0" }}>
    <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 2.5rem" }}>
      <div className="reveal" style={{ textAlign: "center", marginBottom: "4rem" }}>
        <SLabel>Why Join Us</SLabel>
        <STitle>The Top Ridge <em style={{ fontStyle: "italic", color: C.gold, fontWeight: 500 }}>Difference</em></STitle>
        <p style={{ fontSize: "1rem", color: C.muted, lineHeight: 1.75, marginTop: "0.75rem", maxWidth: 540, margin: "0.75rem auto 0" }}>We go beyond the classroom to develop the whole child — academically, spiritually, and socially.</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "1.5rem" }}>
        {WHY.map((w, i) => (
          <div key={w.title} className={`why-card reveal ${["","d1","d2","d1","d2","d3"][i]}`} style={{ background: C.white, borderRadius: 20, padding: "2.25rem", border: `1px solid ${C.border}`, transition: "all .3s", position: "relative", overflow: "hidden" }}>
            <div className="why-bar" style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 3, background: `linear-gradient(to right,${C.gold},${C.goldMid})`, transform: "scaleX(0)", transformOrigin: "left", transition: "transform .4s" }} />
            <div style={{ width: 54, height: 54, borderRadius: 14, background: "rgba(184,134,42,.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, marginBottom: "1.4rem" }}>{w.icon}</div>
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "1.2rem", color: C.navy, marginBottom: 10, fontWeight: 600 }}>{w.title}</div>
            <div style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.7 }}>{w.desc}</div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

// ══════════════════════════════════════════════════════════════════════════════
// ADMISSIONS CTA
// ══════════════════════════════════════════════════════════════════════════════
const AdmissionsCTA = () => (
  <section style={{ background: C.green, padding: "5.5rem 0", position: "relative", overflow: "hidden" }}>
    <div style={{ position: "absolute", top: -80, right: -80, width: 380, height: 380, borderRadius: "50%", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.06)", pointerEvents: "none" }} />
    <div style={{ position: "absolute", bottom: -100, left: "8%", width: 280, height: 280, borderRadius: "50%", background: "rgba(184,134,42,.06)", pointerEvents: "none" }} />
    <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 2.5rem", position: "relative", zIndex: 1, display: "flex", justifyContent: "space-between", alignItems: "center", gap: "2.5rem", flexWrap: "wrap" }}>
      <div className="reveal">
        <div style={{ display: "inline-flex", alignItems: "center", gap: 10, fontSize: 11, fontWeight: 700, letterSpacing: ".16em", textTransform: "uppercase", color: "rgba(255,255,255,.55)", marginBottom: "1rem" }}>
          <span style={{ width: 28, height: 2, background: "rgba(255,255,255,.35)", borderRadius: 1 }} />Admissions 2026
        </div>
        <h2 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(2rem,3.2vw,2.8rem)", fontWeight: 700, color: "#fff", lineHeight: 1.12, letterSpacing: "-.01em", marginTop: "0.5rem" }}>
          Give Your Child the <em style={{ fontStyle: "italic", color: C.goldBright, fontWeight: 400 }}>Best Start</em>
        </h2>
        <p style={{ fontSize: "1rem", color: "rgba(255,255,255,.65)", marginTop: "0.75rem", maxWidth: 480, lineHeight: 1.7 }}>Applications are open for Nursery through JHS 1. Join a community of learners, thinkers, and future leaders at Top Ridge School.</p>
      </div>
      <div className="reveal d2" style={{ display: "flex", gap: "1rem", flexShrink: 0, flexWrap: "wrap" }}>
        <Btn href="/admissions/apply" variant="white">Apply Online Now</Btn>
        <Btn href="/admissions" variant="outlineW">Admission Info</Btn>
      </div>
    </div>
  </section>
);

// ══════════════════════════════════════════════════════════════════════════════
// FOOTER
// ══════════════════════════════════════════════════════════════════════════════
const Footer = () => (
  <footer style={{ background: C.navy, color: "rgba(255,255,255,.65)", paddingTop: 0 }}>
    <div style={{ height: 3, background: `linear-gradient(to right,transparent,${C.goldMid},${C.gold},${C.goldMid},transparent)` }} />
    <div style={{ maxWidth: 1240, margin: "0 auto", padding: "4.5rem 2.5rem 0" }}>
      <div style={{ display: "grid", gridTemplateColumns: "2.2fr 1fr 1fr 1.1fr", gap: "3.5rem", paddingBottom: "3.5rem", borderBottom: "1px solid rgba(255,255,255,.08)" }}>
        {/* Brand */}
        <div>
          <a href="/" style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none", marginBottom: "1.25rem" }}>
            <img src={LOGO_URL} alt="Top Ridge School" style={{ width: 42, height: 42, objectFit: "contain", borderRadius: 6 }} />
            <div>
              <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 17, fontWeight: 700, color: "#fff", lineHeight: 1.1 }}>Top Ridge School</div>
              <div style={{ fontSize: 9.5, color: C.gold, letterSpacing: ".16em", fontWeight: 600, textTransform: "uppercase", marginTop: 2 }}>Excellence · Character · Purpose</div>
            </div>
          </a>
          <p style={{ fontSize: 13, lineHeight: 1.75, marginBottom: "1.75rem", maxWidth: 285, color: "rgba(255,255,255,.5)" }}>Providing world-class education in Accra, Ghana since 2005. Nurturing academic excellence, strong character, and God-given purpose in every child.</p>
          <div style={{ display: "flex", gap: 8 }}>
            {["f","t","in","yt"].map(s => (
              <a key={s} href="#" className="social-link" style={{ width: 36, height: 36, borderRadius: 9, background: "rgba(255,255,255,.07)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, textDecoration: "none", color: "rgba(255,255,255,.6)", transition: "all .2s", border: "1px solid rgba(255,255,255,.08)" }}>{s}</a>
            ))}
          </div>
        </div>

        {/* Quick Links */}
        {[
          { title: "Quick Links", links: ["About Us","Academics","Admissions","News & Events","Gallery","Achievements","Why Join Us"] },
          { title: "Programmes", links: ["Nursery / KG","Primary (B1–6)","JHS (B7–9)","Curriculum","Exam Results 2025","Student Portal","Teacher Portal"] },
        ].map(col => (
          <div key={col.title}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "#fff", marginBottom: "1.5rem" }}>{col.title}</div>
            <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 9 }}>
              {col.links.map(l => (
                <li key={l}><a href="#" className="foot-link" style={{ fontSize: 13, color: "rgba(255,255,255,.5)", textDecoration: "none", transition: "color .2s" }}>{l}</a></li>
              ))}
            </ul>
          </div>
        ))}

        {/* Contact */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "#fff", marginBottom: "1.5rem" }}>Contact</div>
          {[
            { icon: "📍", val: "North Kwashieman, Accra, Ghana" },
            { icon: "📞", val: "+233 271591079" },
            { icon: "✉", val: "topridgeschool@yahoo.com" },
            { icon: "🕗", val: "Mon–Fri: 7:30 AM – 5:00 PM" },
          ].map(c => (
            <div key={c.icon} style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 12, fontSize: 13, color: "rgba(255,255,255,.5)" }}>
              <span style={{ fontSize: 14, marginTop: 1, flexShrink: 0, width: 18, textAlign: "center" }}>{c.icon}</span>
              <span>{c.val}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: "1.5rem 0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem", fontSize: 12 }}>
        <span style={{ color: "rgba(255,255,255,.3)" }}>© 2025 Top Ridge School. All rights reserved.</span>
        <div style={{ display: "flex", gap: "1.5rem" }}>
          {["Privacy Policy","Terms of Use","Sitemap"].map(l => (
            <a key={l} href="#" style={{ color: "rgba(255,255,255,.35)", textDecoration: "none", transition: "color .2s" }}
              onMouseEnter={e => e.target.style.color = "rgba(255,255,255,.75)"}
              onMouseLeave={e => e.target.style.color = "rgba(255,255,255,.35)"}
            >{l}</a>
          ))}
        </div>
      </div>
    </div>
  </footer>
);

// ══════════════════════════════════════════════════════════════════════════════
// ROOT
// ══════════════════════════════════════════════════════════════════════════════
export default function TopRidgeSchool() {
  useReveal();
  return (
    <>
      <style>{GLOBAL_CSS}</style>
      <Topbar />
      <Navbar />
      <Hero />
      <Ticker />
      <PortalStrip />
      <About />
      <Programmes />
      <Stats />
      <News />
      <Events />
      <Testimonials />
      <WhyUs />
      <AdmissionsCTA />
      <Footer />
    </>
  );
}

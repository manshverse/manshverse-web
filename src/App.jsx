import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useContext, useEffect, useState } from "react";
import { AuthContext } from "./context/AuthContext";
import { db, auth } from "./firebase";
import { doc, onSnapshot } from "firebase/firestore";
import { signOut } from "firebase/auth";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Chat from "./pages/Chat";
import Profile from "./pages/Profile";
import Analytics from "./pages/Analytics";
import { STARS } from "./lib/stars";

const SPARSH_UID = "O3FcnaQA5tgNztbkWc2FLRnYdye2";

// ── STARFIELD BACKGROUND ─────────────────────────────────
const StarsBg = () => (
  <>
    <style>{`
      @keyframes twinkle { 0%,100%{opacity:0.12} 50%{opacity:0.55} }
      .app-star { position: absolute; border-radius: 50%; background: #fff; animation: twinkle linear infinite; }
    `}</style>
    <div style={{ position: "fixed", inset: 0, zIndex: 0, overflow: "hidden", pointerEvents: "none" }}>
      {STARS.map(s => (
        <div
          key={s.id}
          className="app-star"
          style={{ left: s.left, top: s.top, width: s.w, height: s.w, animationDuration: s.dur, animationDelay: s.delay, opacity: s.op }}
        />
      ))}
    </div>
  </>
);

// ── FULL-SCREEN LAYOUT SHELL ─────────────────────────────
const LayoutWrap = ({ children }) => (
  <div style={{ background: "#000", minHeight: "100vh", position: "relative", fontFamily: "'Inter', sans-serif" }}>
    <StarsBg />
    <div style={{ position: "relative", zIndex: 1 }}>{children}</div>
  </div>
);

// ── LOADING SCREEN ───────────────────────────────────────
const LoadingScreen = () => (
  <LayoutWrap>
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap');
      @keyframes pulse { 0%,100%{opacity:0.3} 50%{opacity:1} }
      @keyframes spin  { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
    `}</style>
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      height: "100vh", gap: 20,
    }}>
      <div style={{
        width: 48, height: 48,
        background: "linear-gradient(135deg, #3d1f8a, #1a0d2e)",
        border: "1px solid rgba(124,92,252,0.35)",
        borderRadius: 14,
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 0 24px rgba(124,92,252,0.2)",
      }}>
        <svg width="20" height="20" viewBox="0 0 100 100" fill="none">
          <line x1="50" y1="50" x2="50" y2="18" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
          <line x1="50" y1="50" x2="83" y2="61" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
          <line x1="50" y1="50" x2="28" y2="78" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
          <circle cx="50" cy="50" r="4.5" fill="#fff"/>
          <circle cx="50" cy="18" r="3" fill="#fff"/>
          <circle cx="83" cy="61" r="3" fill="#fff"/>
          <circle cx="28" cy="78" r="3" fill="#fff"/>
        </svg>
      </div>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2.5" style={{animation:"spin 1s linear infinite"}}>
        <path d="M21 12a9 9 0 1 1-6.219-8.56" stroke="rgba(124,92,252,0.8)"/>
        <path d="M21 12a9 9 0 0 0-9-9"/>
      </svg>
      <div style={{
        fontSize: 11, color: "#333", letterSpacing: "2px", textTransform: "uppercase",
        fontWeight: 600, animation: "pulse 2s ease infinite",
      }}>
        Manshverse
      </div>
    </div>
  </LayoutWrap>
);

// ── MAINTENANCE SCREEN ───────────────────────────────────
const MaintenanceScreen = ({ notice }) => (
  <LayoutWrap>
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      height: "100vh", padding: 24, textAlign: "center", color: "#fff",
    }}>
      <div style={{
        width: 64, height: 64,
        background: "rgba(250,204,21,0.08)", border: "1px solid rgba(250,204,21,0.2)",
        borderRadius: 20, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 28,
      }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
        </svg>
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>System Maintenance</div>
      <p style={{ color: "#666", maxWidth: 400, lineHeight: 1.7, fontSize: 14, marginBottom: 32 }}>
        {notice || "Manshverse is currently undergoing scheduled upgrades. We'll be back online shortly."}
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{
          background: "rgba(255,255,255,0.06)", color: "#bbb", border: "1px solid rgba(255,255,255,0.1)",
          padding: "12px 28px", borderRadius: 12, fontWeight: 600, cursor: "pointer", fontSize: 14,
          fontFamily: "Inter", transition: "all 0.2s",
        }}
        onMouseEnter={e => { e.target.style.background = "rgba(255,255,255,0.1)"; e.target.style.color = "#fff"; }}
        onMouseLeave={e => { e.target.style.background = "rgba(255,255,255,0.06)"; e.target.style.color = "#bbb"; }}
      >
        Check Again
      </button>
    </div>
  </LayoutWrap>
);

// ── BAN SCREEN ───────────────────────────────────────────
const BannedScreen = () => (
  <LayoutWrap>
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      height: "100vh", padding: 24, textAlign: "center", color: "#fff",
    }}>
      <div style={{
        width: 64, height: 64,
        background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
        borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 28,
      }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fca5a5" strokeWidth="2.5">
          <circle cx="12" cy="12" r="10"/>
          <line x1="15" y1="9" x2="9" y2="15"/>
          <line x1="9" y1="9" x2="15" y2="15"/>
        </svg>
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 12, color: "#fca5a5" }}>Access Denied</div>
      <p style={{ color: "#666", maxWidth: 340, lineHeight: 1.7, fontSize: 14, marginBottom: 32 }}>
        Your account has been suspended for violating Manshverse's terms of service.
      </p>
      <button
        onClick={() => signOut(auth)}
        style={{
          background: "transparent", color: "#666", border: "1px solid rgba(255,255,255,0.1)",
          padding: "10px 24px", borderRadius: 10, cursor: "pointer", fontFamily: "Inter",
          fontSize: 13, fontWeight: 500,
        }}
      >
        Sign Out
      </button>
    </div>
  </LayoutWrap>
);

// ── APP ──────────────────────────────────────────────────
function App() {
  const { user } = useContext(AuthContext);
  const [dbUser, setDbUser] = useState(null);
  const [platformSettings, setPlatformSettings] = useState({ maintenanceMode: false, globalNotice: "" });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubSettings = onSnapshot(doc(db, "settings", "platform"), (snap) => {
      if (snap.exists()) setPlatformSettings(snap.data());
    });

    let unsubUser = () => {};
    if (user?.uid) {
      unsubUser = onSnapshot(doc(db, "users", user.uid), (snap) => {
        if (snap.exists()) setDbUser(snap.data());
        else setDbUser(null);
      });
    } else {
      setDbUser(null);
    }

    const timer = setTimeout(() => setLoading(false), 800);
    return () => { unsubSettings(); unsubUser(); clearTimeout(timer); };
  }, [user?.uid]);

  if (loading) return <LoadingScreen />;

  if (platformSettings.maintenanceMode && user?.uid !== SPARSH_UID) {
    return <MaintenanceScreen notice={platformSettings.globalNotice} />;
  }

  // ── HELPER: is this user considered "fully authenticated"? ──
  // A user is fully authed if:
  // - They are the creator (bypass everything)
  // - They used phone auth (no email to verify)
  // - They used email AND have verified it
  const isFullyAuthed = (u) => {
    if (!u) return false;
    if (u.uid === SPARSH_UID) return true;
    const isPhoneUser = u.providerData?.[0]?.providerId === "phone";
    if (isPhoneUser) return true;
    return u.emailVerified === true;
  };

  // ── PROTECTED ROUTE ─────────────────────────────────────
  const ProtectedRoute = ({ children }) => {
    if (!user) return <Navigate to="/login" replace />;
    if (dbUser?.isBanned) return <BannedScreen />;

    if (!isFullyAuthed(user)) {
      // FIX: sign out first to kill the user session,
      // so /login route doesn't immediately redirect back to /chat
      signOut(auth);
      return <Navigate to="/login" replace />;
    }

    return children;
  };

  return (
    <BrowserRouter>
      <Routes>
        {/* Root redirect */}
        <Route
          path="/"
          element={<Navigate to={isFullyAuthed(user) ? "/chat" : "/login"} replace />}
        />

        {/* Auth routes — FIX: unverified users must NOT be bounced away from login/register */}
        <Route
          path="/login"
          element={isFullyAuthed(user) ? <Navigate to="/chat" replace /> : <Login />}
        />
        <Route
          path="/register"
          element={isFullyAuthed(user) ? <Navigate to="/chat" replace /> : <Register />}
        />

        {/* Protected routes */}
        <Route path="/chat"    element={<ProtectedRoute><Chat /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />

        {/* Creator-only route */}
        <Route
          path="/analytics"
          element={user?.uid === SPARSH_UID ? <Analytics /> : <Navigate to="/chat" replace />}
        />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
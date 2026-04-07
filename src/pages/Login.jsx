import { useState, useEffect } from "react";
import { auth, db, googleProvider } from "../firebase";
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  sendPasswordResetEmail,
  sendEmailVerification,
  signOut,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signInWithRedirect,
  getRedirectResult,
} from "firebase/auth";
import { useNavigate, Link } from "react-router-dom";
import { ensureUserProfileDoc } from "../lib/account";
import { STARS } from "../lib/stars";

const SPARSH_UID = "O3FcnaQA5tgNztbkWc2FLRnYdye2";
const isWebView = /wv|median/i.test(navigator.userAgent);
const isMobileSafari = /iPhone|iPad|iPod/i.test(navigator.userAgent) && !/Chrome/i.test(navigator.userAgent);
const useRedirect = isWebView || isMobileSafari;

const MV_LOGO = (
  <svg width="18" height="18" viewBox="0 0 100 100" fill="none">
    <line x1="50" y1="50" x2="50" y2="18" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"/>
    <line x1="50" y1="50" x2="78" y2="36" stroke="#fff" strokeWidth="1" strokeLinecap="round"/>
    <line x1="50" y1="50" x2="83" y2="61" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"/>
    <line x1="50" y1="50" x2="58" y2="81" stroke="#fff" strokeWidth="1" strokeLinecap="round"/>
    <line x1="50" y1="50" x2="28" y2="78" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"/>
    <line x1="50" y1="50" x2="19" y2="46" stroke="#fff" strokeWidth="1" strokeLinecap="round"/>
    <line x1="50" y1="50" x2="39" y2="21" stroke="#fff" strokeWidth="1.2" strokeLinecap="round"/>
    <circle cx="50" cy="50" r="4" fill="#fff"/>
    <circle cx="50" cy="18" r="2.5" fill="#fff"/>
    <circle cx="83" cy="61" r="2.5" fill="#fff"/>
    <circle cx="28" cy="78" r="2.5" fill="#fff"/>
  </svg>
);

// ── FULL-SCREEN MODAL ───────────────────────────────────
const Modal = ({ icon, title, lines, actions, accent = "#4ade80", steps }) => (
  <div style={{
    position:"fixed",inset:0,background:"rgba(0,0,0,0.9)",backdropFilter:"blur(16px)",
    display:"flex",alignItems:"center",justifyContent:"center",zIndex:800,padding:24,
  }}>
    <div style={{
      background:"rgba(8,8,14,0.99)",border:"1px solid rgba(255,255,255,0.1)",
      borderRadius:24,padding:36,maxWidth:440,width:"100%",
      animation:"fadeUp 0.25s cubic-bezier(0.16,1,0.3,1)",
    }}>
      <div style={{fontSize:52,textAlign:"center",marginBottom:20}}>{icon}</div>
      <div style={{fontSize:21,fontWeight:700,color:"#fff",textAlign:"center",marginBottom:12,letterSpacing:"-0.3px"}}>{title}</div>
      {lines.map((l, i) => (
        <div key={i} style={{fontSize:14,color:"#888",lineHeight:1.75,marginBottom:8,textAlign:"center"}}
          dangerouslySetInnerHTML={{__html: l}}/>
      ))}

      {/* Step-by-step instructions */}
      {steps && (
        <div style={{margin:"20px 0",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:16,padding:"18px 20px"}}>
          {steps.map((s, i) => (
            <div key={i} style={{display:"flex",alignItems:"flex-start",gap:12,marginBottom: i < steps.length-1 ? 14 : 0}}>
              <div style={{width:24,height:24,borderRadius:"50%",background:"rgba(124,92,252,0.2)",border:"1px solid rgba(124,92,252,0.4)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#a78bfa",flexShrink:0,marginTop:1}}>
                {i+1}
              </div>
              <div style={{fontSize:13.5,color:"#bbb",lineHeight:1.6}} dangerouslySetInnerHTML={{__html: s}}/>
            </div>
          ))}
        </div>
      )}

      {/* Spam warning */}
      <div style={{
        display:"flex",alignItems:"flex-start",gap:10,
        background:"rgba(250,204,21,0.06)",border:"1px dashed rgba(250,204,21,0.25)",
        borderRadius:12,padding:"12px 14px",marginBottom:20,
      }}>
        <span style={{fontSize:16,flexShrink:0}}>⚠️</span>
        <span style={{fontSize:12.5,color:"#fbbf24",lineHeight:1.6}}>
          <strong>Always check your Spam / Junk folder first.</strong> Verification emails often land there, especially from new services.
        </span>
      </div>

      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {actions.map((a, i) => (
          <button key={i} onClick={a.onClick} style={{
            width:"100%",padding:"14px",borderRadius:12,border:"none",
            background: i===0 ? (accent==="purple" ? "#7c5cfc" : "#fff") : "rgba(255,255,255,0.05)",
            color: i===0 ? (accent==="purple" ? "#fff" : "#000") : "#777",
            fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"Inter",
            border: i!==0 ? "1px solid rgba(255,255,255,0.08)" : "none",
            transition:"all 0.2s",
          }}>
            {a.label}
          </button>
        ))}
      </div>
    </div>
  </div>
);

export default function Login() {
  const [method, setMethod] = useState("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState(null);

  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const [resetMode, setResetMode] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [unverifiedUser, setUnverifiedUser] = useState(null);
  const [modal, setModal] = useState(null);

  const navigate = useNavigate();

  useEffect(() => {
    const handleRedirect = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result?.user) {
          await ensureUserProfileDoc(db, result.user);
          navigate("/chat");
        }
      } catch (err) {
        if (err.code && err.code !== "auth/no-auth-event") {
          setError("Google sign-in failed. Please try again.");
        }
      }
    };
    handleRedirect();
  }, [navigate]);

  const setupRecaptcha = () => {
    if (!window.recaptchaVerifier) {
      window.recaptchaVerifier = new RecaptchaVerifier(auth, "recaptcha-container", { size: "invisible" });
    }
  };

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    setLoading(true); setError(""); setMsg(""); setUnverifiedUser(null);
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      const userObj = result.user;

      if (!userObj.emailVerified && userObj.uid !== SPARSH_UID) {
        setUnverifiedUser(userObj);
        await signOut(auth);
        setNeedsVerification(true);
        setLoading(false);
        return;
      }

      await ensureUserProfileDoc(db, userObj);
      navigate("/chat");
    } catch (err) {
      if (["auth/invalid-credential","auth/user-not-found","auth/wrong-password"].includes(err.code)) {
        setError("Invalid email or password. Double-check your credentials.");
      } else {
        setError("Login failed: " + err.message);
      }
    }
    setLoading(false);
  };

  const handleResendVerification = async () => {
    if (!unverifiedUser) return;
    setLoading(true); setError("");
    try {
      await sendEmailVerification(unverifiedUser);
      setNeedsVerification(false);
      setModal({
        icon: "✉️",
        title: "Verification Link Sent!",
        lines: [
          `A new link was sent to <strong style="color:#fff">${unverifiedUser.email}</strong>.`,
        ],
        steps: [
          "Open your email inbox (Gmail, Outlook, etc.)",
          "<strong style='color:#fbbf24'>Check Spam/Junk folder</strong> if you don't see it in inbox",
          "Click the verification link in the email",
          "Come back here and sign in with your email & password",
        ],
        actions: [
          { label: "Got it — I'll verify now ✓", onClick: () => setModal(null) },
        ],
        accent: "purple",
      });
    } catch (err) {
      if (err.code === "auth/too-many-requests") {
        setError("Too many requests. Please wait a few minutes before trying again.");
      } else {
        setError("Failed to resend. Please try logging in again.");
      }
    }
    setLoading(false);
  };

  const handleSendOTP = async (e) => {
    e.preventDefault();
    setLoading(true); setError(""); setMsg("");
    try {
      setupRecaptcha();
      const appVerifier = window.recaptchaVerifier;
      const formattedPhone = phone.startsWith("+") ? phone : `+91${phone}`;
      const result = await signInWithPhoneNumber(auth, formattedPhone, appVerifier);
      setConfirmationResult(result);
      setOtpSent(true);
      setMsg("OTP sent successfully via SMS.");
    } catch (err) {
      if (err.code === "auth/invalid-phone-number") setError("Invalid phone format. Try +91XXXXXXXXXX.");
      else setError("Failed to send OTP. Check Firebase Region Policy.");
      if (window.recaptchaVerifier) { window.recaptchaVerifier.clear(); window.recaptchaVerifier = null; }
    }
    setLoading(false);
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const result = await confirmationResult.confirm(otp);
      await ensureUserProfileDoc(db, result.user, { phone, photoURL: "" });
      navigate("/chat");
    } catch {
      setError("Invalid OTP code. Please try again.");
    }
    setLoading(false);
  };

  const handleGoogle = async () => {
    setError(""); setMsg(""); setGoogleLoading(true);
    try {
      if (useRedirect) {
        await signInWithRedirect(auth, googleProvider);
        return;
      }
      const result = await signInWithPopup(auth, googleProvider);
      await ensureUserProfileDoc(db, result.user);
      navigate("/chat");
    } catch (err) {
      if (err.code === "auth/popup-blocked" || err.code === "auth/popup-closed-by-user") {
        try { await signInWithRedirect(auth, googleProvider); return; }
        catch { setError("Google sign-in failed. Please try email login."); }
      } else if (err.code !== "auth/cancelled-popup-request") {
        setError("Google sign-in failed. Please try email login.");
      }
    }
    setGoogleLoading(false);
  };

  const handleReset = async (e) => {
    e.preventDefault();
    if (!email) { setError("Enter your email address first."); return; }
    setLoading(true); setError("");
    try {
      await sendPasswordResetEmail(auth, email);
      setResetMode(false);
      setModal({
        icon: "🔑",
        title: "Password Reset Link Sent",
        lines: [
          `We sent a reset link to <strong style="color:#fff">${email}</strong>.`,
        ],
        steps: [
          "Open your email inbox",
          "<strong style='color:#fbbf24'>Check Spam/Junk folder</strong> if not in inbox",
          "Click the reset link (expires in 1 hour)",
          "Set a new strong password",
          "Come back and sign in with your new password",
        ],
        actions: [
          { label: "Back to Login", onClick: () => setModal(null) },
        ],
      });
    } catch {
      setResetMode(false);
      setModal({
        icon: "🔑",
        title: "Reset Link Sent",
        lines: ["If an account with that email exists, a reset link was sent."],
        steps: [
          "<strong style='color:#fbbf24'>Check Spam/Junk folder first</strong>",
          "Click the reset link in the email",
          "Come back and sign in with new password",
        ],
        actions: [{ label: "Back to Login", onClick: () => setModal(null) }],
      });
    }
    setLoading(false);
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body, #root { height: 100%; background: #000; font-family: 'Inter', sans-serif; }
        @keyframes twinkle { 0%,100%{opacity:0.15} 50%{opacity:0.7} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        .starfield { position: fixed; inset: 0; z-index: 0; overflow: hidden; pointer-events: none; }
        .star { position: absolute; border-radius: 50%; background: #fff; animation: twinkle linear infinite; }
        .lp { min-height: 100vh; width: 100vw; display: flex; align-items: center; justify-content: center; padding: 24px 16px; position: relative; overflow-y: auto; z-index: 1; }
        .lp-glow { position: absolute; width: 600px; height: 600px; border-radius: 50%; background: radial-gradient(circle,rgba(108,71,255,0.07) 0%,transparent 65%); top: 50%; left: 50%; transform: translate(-50%,-50%); pointer-events: none; }
        .lp-wrap { width: 100%; max-width: 420px; position: relative; z-index: 2; animation: fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) forwards; padding: 20px 0; }
        .lp-head { text-align: center; margin-bottom: 32px; }
        .lp-mark { display: inline-flex; align-items: center; justify-content: center; width: 52px; height: 52px; background: linear-gradient(135deg,#3d1f8a,#1a0d2e); border: 1px solid rgba(124,92,252,0.3); border-radius: 16px; margin-bottom: 20px; box-shadow: 0 0 24px rgba(124,92,252,0.2); }
        .lp-title { font-size: 26px; font-weight: 700; color: #fff; letter-spacing: -0.5px; margin-bottom: 8px; }
        .lp-sub { font-size: 14px; color: #888; }
        .lp-tabs { display: flex; background: rgba(255,255,255,0.03); padding: 4px; border-radius: 12px; margin-bottom: 24px; border: 1px solid rgba(255,255,255,0.05); }
        .lp-tab { flex: 1; padding: 11px; border: none; background: transparent; color: #666; font-size: 13px; font-weight: 600; cursor: pointer; border-radius: 8px; transition: 0.2s; font-family: 'Inter'; }
        .lp-tab:hover { color: #ccc; }
        .lp-tab.active { background: rgba(255,255,255,0.07); color: #fff; border: 1px solid rgba(255,255,255,0.06); }
        .lp-card { background: rgba(8,8,14,0.75); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px); border: 1px solid rgba(255,255,255,0.09); border-radius: 24px; padding: 32px; box-shadow: 0 20px 60px rgba(0,0,0,0.7); }
        .lp-field { margin-bottom: 20px; }
        .lp-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .lp-label { font-size: 11px; color: #555; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; display: block; }
        .lp-forgot { background: none; border: none; color: #7c5cfc; font-size: 12px; font-weight: 600; cursor: pointer; font-family: 'Inter'; transition: 0.2s; }
        .lp-forgot:hover { color: #a78bfa; text-decoration: underline; }
        .lp-input { width: 100%; background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 14px 16px; font-size: 15px; font-family: 'Inter'; color: #fff; outline: none; transition: all 0.2s; -webkit-appearance: none; }
        .lp-input::placeholder { color: #333; }
        .lp-input:focus { border-color: rgba(124,92,252,0.6); background: rgba(255,255,255,0.02); box-shadow: 0 0 0 4px rgba(124,92,252,0.1); }
        .lp-err { font-size: 13.5px; color: #fca5a5; background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.2); border-radius: 12px; padding: 13px 16px; margin-bottom: 18px; line-height: 1.5; }
        .lp-msg { font-size: 13.5px; color: #86efac; background: rgba(34,197,94,0.08); border: 1px solid rgba(34,197,94,0.2); border-radius: 12px; padding: 13px 16px; margin-bottom: 18px; line-height: 1.5; }
        .lp-btn { width: 100%; background: #fff; color: #000; border: none; border-radius: 14px; padding: 16px; font-size: 15px; font-weight: 700; font-family: 'Inter'; cursor: pointer; margin-top: 10px; transition: all 0.2s; -webkit-tap-highlight-color: transparent; }
        .lp-btn:hover { background: #e8e8e8; }
        .lp-btn:active { transform: scale(0.98); }
        .lp-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .lp-btn.purple { background: #7c5cfc; color: #fff; }
        .lp-btn.purple:hover { background: #9171fd; }
        .lp-divider { display: flex; align-items: center; gap: 12px; margin: 22px 0; }
        .lp-div-line { flex: 1; height: 1px; background: rgba(255,255,255,0.07); }
        .lp-div-txt { font-size: 11px; color: #444; text-transform: uppercase; letter-spacing: 1px; font-weight: 600; }
        .lp-google { width: 100%; background: transparent; border: 1px solid rgba(255,255,255,0.14); border-radius: 14px; padding: 14px; font-size: 14px; font-weight: 600; color: #aaa; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px; font-family: 'Inter'; transition: all 0.2s; -webkit-tap-highlight-color: transparent; }
        .lp-google:hover { border-color: rgba(255,255,255,0.28); color: #fff; background: rgba(255,255,255,0.04); }
        .lp-google:disabled { opacity: 0.5; cursor: not-allowed; }
        .lp-resend { display: block; width: 100%; margin-top: 16px; background: none; border: none; color: #666; font-size: 13px; font-weight: 600; cursor: pointer; text-decoration: underline; transition: 0.2s; font-family: 'Inter'; }
        .lp-resend:hover { color: #fff; }
        .lp-footer { text-align: center; font-size: 13px; color: #555; margin-top: 28px; }
        .lp-footer a { color: #fff; text-decoration: none; font-weight: 600; margin-left: 4px; border-bottom: 1px solid #333; transition: 0.2s; }
        .lp-footer a:hover { color: #c4b5fd; border-color: #c4b5fd; }
        .verif-icon { width: 64px; height: 64px; border-radius: 50%; background: rgba(250,204,21,0.1); border: 1px solid rgba(250,204,21,0.3); display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; }
        .verif-title { font-size: 22px; font-weight: 700; color: #fff; margin-bottom: 12px; text-align: center; }
        .verif-desc { font-size: 14px; color: #888; line-height: 1.65; margin-bottom: 16px; text-align: center; }
        .verif-steps { margin-bottom: 24px; }
        .verif-step { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 12px; }
        .verif-step-num { width: 24px; height: 24px; border-radius: 50%; background: rgba(124,92,252,0.2); border: 1px solid rgba(124,92,252,0.4); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; color: #a78bfa; flex-shrink: 0; }
        .verif-step-txt { font-size: 13.5px; color: #bbb; line-height: 1.6; padding-top: 2px; }
        .verif-spam { font-size: 13px; color: #facc15; background: rgba(250,204,21,0.07); border: 1px dashed rgba(250,204,21,0.3); padding: 14px; border-radius: 12px; margin-bottom: 24px; line-height: 1.6; display: flex; gap: 10px; align-items: flex-start; }
        @media(max-width:480px){ .lp-card { padding: 24px 20px; } .lp-title { font-size: 22px; } }
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
      `}</style>

      <div id="recaptcha-container" style={{display:"none"}}/>
      {modal && <Modal {...modal}/>}

      <div className="starfield">
        {STARS?.map(s => (
          <div key={s.id} className="star" style={{left:s.left,top:s.top,width:s.w,height:s.w,animationDuration:s.dur,animationDelay:s.delay,opacity:s.op}}/>
        ))}
      </div>

      <div className="lp">
        <div className="lp-glow"/>
        <div className="lp-wrap">
          <div className="lp-head">
            <div className="lp-mark">{MV_LOGO}</div>
            <div className="lp-title">Manshverse</div>
            <div className="lp-sub">
              {needsVerification ? "Email Verification Required" : resetMode ? "Reset your password" : "Sign in to your account"}
            </div>
          </div>

          <div className="lp-card">
            {error && <div className="lp-err">{error}</div>}
            {msg && <div className="lp-msg">{msg}</div>}

            {/* ── EMAIL NOT VERIFIED STATE ── */}
            {needsVerification ? (
              <div>
                <div className="verif-icon">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#facc15" strokeWidth="2.5" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </div>
                <div className="verif-title">Verify Your Email First</div>
                <div className="verif-desc">
                  <strong style={{color:"#fff"}}>{unverifiedUser?.email}</strong> hasn't been verified yet.
                </div>

                <div className="verif-steps">
                  {[
                    "Click <strong style='color:#fff'>Resend Verification Link</strong> below",
                    "<strong style='color:#fbbf24'>Check your Spam/Junk folder</strong> — it almost always ends up there",
                    "Click the verification link in the email",
                    "Come back here and sign in normally",
                  ].map((s, i) => (
                    <div className="verif-step" key={i}>
                      <div className="verif-step-num">{i+1}</div>
                      <div className="verif-step-txt" dangerouslySetInnerHTML={{__html: s}}/>
                    </div>
                  ))}
                </div>

                <div className="verif-spam">
                  <span style={{fontSize:18}}>⚠️</span>
                  <span><strong>Spam folder check is crucial.</strong> Firebase verification emails are frequently filtered as spam by Gmail, Outlook, and Yahoo.</span>
                </div>

                <button className="lp-btn purple" onClick={handleResendVerification} disabled={loading}>
                  {loading ? "Sending..." : "📧 Resend Verification Link"}
                </button>
                <button className="lp-resend" onClick={() => { setNeedsVerification(false); setError(""); }}>
                  ← Back to Login
                </button>
              </div>

            /* ── PASSWORD RESET ── */
            ) : resetMode ? (
              <form onSubmit={handleReset}>
                <div style={{textAlign:"center",marginBottom:20}}>
                  <div style={{fontSize:40,marginBottom:12}}>🔑</div>
                  <div style={{fontSize:14,color:"#666",lineHeight:1.65}}>Enter your email and we'll send a password reset link.</div>
                </div>
                <div className="lp-field">
                  <div className="lp-row"><label className="lp-label">Email Address</label></div>
                  <input className="lp-input" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required autoFocus/>
                </div>
                <button className="lp-btn" type="submit" disabled={loading}>{loading ? "Sending..." : "Send Reset Link →"}</button>
                <button type="button" className="lp-resend" onClick={() => { setResetMode(false); setError(""); setMsg(""); }}>← Back to login</button>
              </form>

            /* ── NORMAL LOGIN ── */
            ) : (
              <>
                <div className="lp-tabs">
                  <button className={`lp-tab ${method==="email"?"active":""}`} onClick={() => { setMethod("email"); setError(""); setMsg(""); }}>Email</button>
                  <button className={`lp-tab ${method==="phone"?"active":""}`} onClick={() => { setMethod("phone"); setError(""); setMsg(""); }}>Phone</button>
                </div>

                {method === "email" && (
                  <form onSubmit={handleEmailLogin}>
                    <div className="lp-field">
                      <div className="lp-row"><label className="lp-label">Email</label></div>
                      <input className="lp-input" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required autoFocus/>
                    </div>
                    <div className="lp-field">
                      <div className="lp-row">
                        <label className="lp-label">Password</label>
                        <button type="button" className="lp-forgot" onClick={() => { setResetMode(true); setError(""); setMsg(""); }}>Forgot password?</button>
                      </div>
                      <input className="lp-input" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required/>
                    </div>
                    <button className="lp-btn" type="submit" disabled={loading}>{loading ? "Authenticating..." : "Access Manshverse →"}</button>
                  </form>
                )}

                {method === "phone" && (
                  <form onSubmit={otpSent ? handleVerifyOTP : handleSendOTP}>
                    {!otpSent ? (
                      <>
                        <div className="lp-field">
                          <div className="lp-row"><label className="lp-label">Phone Number</label></div>
                          <input className="lp-input" type="tel" placeholder="98765 43210 (defaults to +91)" value={phone} onChange={e => setPhone(e.target.value)} required autoFocus/>
                        </div>
                        <button className="lp-btn" type="submit" disabled={loading}>{loading ? "Sending Code..." : "Send Verification Code →"}</button>
                      </>
                    ) : (
                      <>
                        <div className="lp-field">
                          <div className="lp-row"><label className="lp-label">6-Digit Code</label></div>
                          <input className="lp-input" type="text" inputMode="numeric" pattern="[0-9]*" placeholder="0 0 0  0 0 0" value={otp} onChange={e => setOtp(e.target.value)} maxLength={6} required autoFocus style={{letterSpacing:"8px",fontSize:"22px",textAlign:"center",fontWeight:"700"}}/>
                        </div>
                        <button className="lp-btn" type="submit" disabled={loading}>{loading ? "Verifying..." : "Verify & Sign In"}</button>
                        <button type="button" onClick={() => { setOtpSent(false); setOtp(""); }} className="lp-resend">Wrong number? Go back</button>
                      </>
                    )}
                  </form>
                )}

                <div className="lp-divider">
                  <span className="lp-div-line"/><span className="lp-div-txt">or</span><span className="lp-div-line"/>
                </div>
                <button className="lp-google" onClick={handleGoogle} disabled={googleLoading}>
                  {googleLoading ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{animation:"spin 1s linear infinite"}}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20H24v8h11.3C33.6 33.1 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 20-8 20-20 0-1.3-.1-2.7-.4-4z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 16 19 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.8 13.5-4.7l-6.2-5.2C29.3 35.6 26.8 36.5 24 36.5c-5.2 0-9.6-3.5-11.2-8.3l-6.5 5C9.8 40.1 16.4 44 24 44z"/><path fill="#1976D2" d="M43.6 20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.7l6.2 5.2C41 35.6 44 30.2 44 24c0-1.3-.1-2.7-.4-4z"/></svg>
                  )}
                  {googleLoading ? (useRedirect ? "Redirecting to Google..." : "Signing in...") : "Continue with Google"}
                </button>
              </>
            )}
          </div>

          {!resetMode && !needsVerification && (
            <p className="lp-footer">Don't have an account?<Link to="/register">Create one</Link></p>
          )}
        </div>
      </div>
    </>
  );
}
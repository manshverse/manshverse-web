import { useState, useEffect } from "react";
import { auth, db, googleProvider } from "../firebase";
import {
  createUserWithEmailAndPassword,
  updateProfile,
  sendEmailVerification,
  signOut,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
} from "firebase/auth";
import { useNavigate, Link } from "react-router-dom";
import { ensureUserProfileDoc } from "../lib/account";
import { STARS } from "../lib/stars";

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

// ── POST-REGISTRATION SUCCESS SCREEN ────────────────────
const VerifyEmailScreen = ({ email, onGoToLogin }) => (
  <div style={{textAlign:"center"}}>
    {/* Animated envelope */}
    <div style={{
      width:80,height:80,borderRadius:"50%",
      background:"linear-gradient(135deg,rgba(124,92,252,0.2),rgba(167,139,250,0.1))",
      border:"1px solid rgba(124,92,252,0.3)",
      display:"flex",alignItems:"center",justifyContent:"center",
      margin:"0 auto 24px",fontSize:36,
    }}>
      ✉️
    </div>

    <div style={{fontSize:22,fontWeight:700,color:"#fff",marginBottom:10,letterSpacing:"-0.3px"}}>
      Account Created! 🎉
    </div>
    <div style={{fontSize:14,color:"#666",marginBottom:24,lineHeight:1.7}}>
      We sent a verification link to<br/>
      <strong style={{color:"#fff"}}>{email}</strong>
    </div>

    {/* Steps */}
    <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:16,padding:"20px",marginBottom:20,textAlign:"left"}}>
      <div style={{fontSize:11,fontWeight:700,color:"#555",textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:16}}>What to do next</div>
      {[
        { icon:"📬", text:"Open your email inbox", sub:"Check the inbox for the email you just used" },
        { icon:"🚨", text:"Check Spam / Junk folder", sub:"Firebase emails almost always get filtered there", highlight:true },
        { icon:"🔗", text:"Click the verification link", sub:"Opens a page confirming your email is verified" },
        { icon:"🔐", text:"Come back and sign in", sub:"Use your email + password to access Manshverse" },
      ].map((s, i) => (
        <div key={i} style={{display:"flex",alignItems:"flex-start",gap:14,marginBottom: i < 3 ? 16 : 0}}>
          <div style={{
            width:38,height:38,borderRadius:10,flexShrink:0,
            background: s.highlight ? "rgba(250,204,21,0.1)" : "rgba(255,255,255,0.04)",
            border: s.highlight ? "1px solid rgba(250,204,21,0.25)" : "1px solid rgba(255,255,255,0.07)",
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,
          }}>
            {s.icon}
          </div>
          <div>
            <div style={{fontSize:13.5,fontWeight:600,color: s.highlight ? "#fbbf24" : "#ccc",marginBottom:3}}>{s.text}</div>
            <div style={{fontSize:12,color:"#555",lineHeight:1.5}}>{s.sub}</div>
          </div>
        </div>
      ))}
    </div>

    {/* Spam warning box */}
    <div style={{
      background:"rgba(250,204,21,0.06)",border:"1px dashed rgba(250,204,21,0.3)",
      borderRadius:12,padding:"13px 16px",marginBottom:24,
      display:"flex",alignItems:"flex-start",gap:10,textAlign:"left",
    }}>
      <span style={{fontSize:18,flexShrink:0}}>⚠️</span>
      <span style={{fontSize:12.5,color:"#fbbf24",lineHeight:1.6}}>
        <strong>Spam folder is critical.</strong> Gmail, Outlook, and Yahoo frequently filter Firebase verification emails. If you don't see it in 2 minutes, check spam.
      </span>
    </div>

    <button
      onClick={onGoToLogin}
      style={{
        width:"100%",background:"#7c5cfc",color:"#fff",border:"none",
        borderRadius:14,padding:16,fontSize:15,fontWeight:700,
        cursor:"pointer",fontFamily:"Inter",transition:"all 0.2s",
        marginBottom:12,
      }}
    >
      Go to Login →
    </button>
    <div style={{fontSize:12,color:"#444"}}>Already verified? Sign in above ↑</div>
  </div>
);

// ── STYLED MODAL ─────────────────────────────────────────
const Modal = ({ icon, title, lines, actions, accent = "#4ade80" }) => (
  <div style={{
    position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",backdropFilter:"blur(14px)",
    display:"flex",alignItems:"center",justifyContent:"center",zIndex:800,padding:24,
  }}>
    <div style={{
      background:"rgba(8,8,14,0.98)",border:"1px solid rgba(255,255,255,0.1)",
      borderRadius:24,padding:36,maxWidth:420,width:"100%",
      animation:"fadeUp 0.25s cubic-bezier(0.16,1,0.3,1)",
    }}>
      <div style={{fontSize:48,textAlign:"center",marginBottom:20}}>{icon}</div>
      <div style={{fontSize:20,fontWeight:700,color:"#fff",textAlign:"center",marginBottom:14}}>{title}</div>
      {lines.map((l, i) => (
        <div key={i} style={{fontSize:14,color:"#999",lineHeight:1.7,marginBottom:8,textAlign:"center"}}
          dangerouslySetInnerHTML={{__html: l}}/>
      ))}
      <div style={{marginTop:28,display:"flex",flexDirection:"column",gap:10}}>
        {actions.map((a, i) => (
          <button key={i} onClick={a.onClick} style={{
            width:"100%",padding:"14px",borderRadius:12,
            background: i===0 ? (accent==="purple" ? "#7c5cfc" : "#fff") : "rgba(255,255,255,0.05)",
            color: i===0 ? (accent==="purple" ? "#fff" : "#000") : "#888",
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

export default function Register() {
  const [method, setMethod] = useState("email");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState(null);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [modal, setModal] = useState(null);

  // NEW: show full-screen verify screen after registration
  const [showVerifyScreen, setShowVerifyScreen] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState("");

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

  const validatePassword = (pass) => {
    return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{18,}$/.test(pass);
  };

  const handleEmailRegister = async (e) => {
    e.preventDefault();
    if (!validatePassword(password)) {
      setError("Password must be at least 18 characters and include an uppercase letter, a number, and a symbol.");
      return;
    }
    setLoading(true); setError("");
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(result.user, { displayName: name });
      await ensureUserProfileDoc(db, result.user, { name, email, photoURL: "" });
      await sendEmailVerification(result.user);
      await signOut(auth);
      // Show the full-screen verify instructions instead of a modal
      setRegisteredEmail(email);
      setShowVerifyScreen(true);
    } catch (err) {
      if (err.code === "auth/email-already-in-use") {
        setError("An account with this email already exists. Try logging in instead.");
      } else if (err.code === "auth/password-does-not-meet-requirements") {
        setError("Password doesn't meet Firebase security requirements. Make it stronger.");
      } else {
        setError("Registration failed: " + err.message);
      }
    }
    setLoading(false);
  };

  const handleSendOTP = async (e) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      setupRecaptcha();
      const appVerifier = window.recaptchaVerifier;
      const formattedPhone = phone.startsWith("+") ? phone : `+91${phone}`;
      const result = await signInWithPhoneNumber(auth, formattedPhone, appVerifier);
      setConfirmationResult(result);
      setOtpSent(true);
    } catch (err) {
      if (err.code === "auth/invalid-phone-number") setError("Invalid phone format. Try +91XXXXXXXXXX.");
      else setError("Failed to send OTP. Check your Firebase SMS Region Policy.");
      if (window.recaptchaVerifier) { window.recaptchaVerifier.clear(); window.recaptchaVerifier = null; }
    }
    setLoading(false);
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const result = await confirmationResult.confirm(otp);
      await updateProfile(result.user, { displayName: name });
      await ensureUserProfileDoc(db, result.user, { name, phone, photoURL: "" });
      navigate("/chat");
    } catch {
      setError("Invalid OTP code. Please try again.");
    }
    setLoading(false);
  };

  const handleGoogle = async () => {
    setError(""); setGoogleLoading(true);
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
        catch { setError("Google sign-in failed. Please try email registration."); }
      } else if (err.code !== "auth/cancelled-popup-request") {
        setError("Google sign-in failed. Please try email registration.");
      }
    }
    setGoogleLoading(false);
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
        .rp { min-height: 100vh; width: 100vw; display: flex; align-items: center; justify-content: center; padding: 24px 16px; position: relative; overflow-y: auto; z-index: 1; }
        .rp-glow { position: absolute; width: 600px; height: 600px; border-radius: 50%; background: radial-gradient(circle,rgba(108,71,255,0.07) 0%,transparent 65%); top: 50%; left: 50%; transform: translate(-50%,-50%); pointer-events: none; }
        .rp-wrap { width: 100%; max-width: 420px; position: relative; z-index: 2; animation: fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) forwards; padding: 20px 0; }
        .rp-head { text-align: center; margin-bottom: 32px; }
        .rp-mark { display: inline-flex; align-items: center; justify-content: center; width: 52px; height: 52px; background: linear-gradient(135deg,#3d1f8a,#1a0d2e); border: 1px solid rgba(124,92,252,0.3); border-radius: 16px; margin-bottom: 20px; box-shadow: 0 0 24px rgba(124,92,252,0.2); }
        .rp-title { font-size: 26px; font-weight: 700; color: #fff; letter-spacing: -0.5px; margin-bottom: 8px; }
        .rp-sub { font-size: 14px; color: #888; }
        .rp-tabs { display: flex; background: rgba(255,255,255,0.03); padding: 4px; border-radius: 12px; margin-bottom: 24px; border: 1px solid rgba(255,255,255,0.05); }
        .rp-tab { flex: 1; padding: 11px; border: none; background: transparent; color: #666; font-size: 13px; font-weight: 600; cursor: pointer; border-radius: 8px; transition: 0.2s; font-family: 'Inter'; }
        .rp-tab:hover { color: #ccc; }
        .rp-tab.active { background: rgba(255,255,255,0.07); color: #fff; border: 1px solid rgba(255,255,255,0.06); }
        .rp-card { background: rgba(8,8,14,0.75); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px); border: 1px solid rgba(255,255,255,0.09); border-radius: 24px; padding: 32px; box-shadow: 0 20px 60px rgba(0,0,0,0.7); }
        .rp-field { margin-bottom: 20px; }
        .rp-label { font-size: 11px; color: #555; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 8px; display: block; }
        .rp-input { width: 100%; background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 14px 16px; font-size: 15px; font-family: 'Inter'; color: #fff; outline: none; transition: all 0.2s; -webkit-appearance: none; }
        .rp-input::placeholder { color: #333; }
        .rp-input:focus { border-color: rgba(124,92,252,0.6); background: rgba(255,255,255,0.02); box-shadow: 0 0 0 4px rgba(124,92,252,0.1); }
        .rp-err { font-size: 13.5px; color: #fca5a5; background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.2); border-radius: 12px; padding: 13px 16px; margin-bottom: 18px; line-height: 1.5; }
        .rp-btn { width: 100%; background: #fff; color: #000; border: none; border-radius: 14px; padding: 16px; font-size: 15px; font-weight: 700; font-family: 'Inter'; cursor: pointer; margin-top: 10px; transition: all 0.2s; -webkit-tap-highlight-color: transparent; }
        .rp-btn:hover { background: #e8e8e8; }
        .rp-btn:active { transform: scale(0.98); }
        .rp-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .rp-divider { display: flex; align-items: center; gap: 12px; margin: 22px 0; }
        .rp-div-line { flex: 1; height: 1px; background: rgba(255,255,255,0.07); }
        .rp-div-txt { font-size: 11px; color: #444; text-transform: uppercase; letter-spacing: 1px; font-weight: 600; }
        .rp-google { width: 100%; background: transparent; border: 1px solid rgba(255,255,255,0.14); border-radius: 14px; padding: 14px; font-size: 14px; font-weight: 600; color: #aaa; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px; font-family: 'Inter'; transition: all 0.2s; -webkit-tap-highlight-color: transparent; }
        .rp-google:hover { border-color: rgba(255,255,255,0.28); color: #fff; background: rgba(255,255,255,0.04); }
        .rp-google:disabled { opacity: 0.5; cursor: not-allowed; }
        .rp-footer { text-align: center; font-size: 13px; color: #555; margin-top: 28px; }
        .rp-footer a { color: #fff; text-decoration: none; font-weight: 600; margin-left: 4px; border-bottom: 1px solid #333; transition: 0.2s; }
        .rp-footer a:hover { color: #c4b5fd; border-color: #c4b5fd; }
        .rp-hint { font-size: 12px; color: #444; margin-top: 8px; line-height: 1.5; }
        .pw-strength { margin-top: 8px; display: flex; gap: 4px; }
        .pw-bar { flex: 1; height: 3px; border-radius: 2px; background: rgba(255,255,255,0.07); transition: background 0.3s; }
        @media(max-width:480px){ .rp-card { padding: 24px 20px; } .rp-title { font-size: 22px; } }
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
      `}</style>

      <div id="recaptcha-container" style={{display:"none"}}/>
      {modal && <Modal {...modal}/>}

      <div className="starfield">
        {STARS?.map(s => (
          <div key={s.id} className="star" style={{left:s.left,top:s.top,width:s.w,height:s.w,animationDuration:s.dur,animationDelay:s.delay,opacity:s.op}}/>
        ))}
      </div>

      <div className="rp">
        <div className="rp-glow"/>
        <div className="rp-wrap">
          <div className="rp-head">
            <div className="rp-mark">{MV_LOGO}</div>
            <div className="rp-title">{showVerifyScreen ? "Manshverse" : "Join Manshverse"}</div>
            <div className="rp-sub">{showVerifyScreen ? "One last step" : "Create your account"}</div>
          </div>

          <div className="rp-card">
            {/* ── POST-REGISTRATION VERIFY SCREEN ── */}
            {showVerifyScreen ? (
              <VerifyEmailScreen
                email={registeredEmail}
                onGoToLogin={() => navigate("/login")}
              />
            ) : (
              <>
                <div className="rp-tabs">
                  <button className={`rp-tab ${method==="email"?"active":""}`} onClick={() => { setMethod("email"); setError(""); }}>Email</button>
                  <button className={`rp-tab ${method==="phone"?"active":""}`} onClick={() => { setMethod("phone"); setError(""); }}>Phone</button>
                </div>

                {error && <div className="rp-err">{error}</div>}

                {method === "email" ? (
                  <form onSubmit={handleEmailRegister}>
                    <div className="rp-field">
                      <label className="rp-label">Full Name</label>
                      <input className="rp-input" type="text" placeholder="e.g. Sparsh Sharma" value={name} onChange={e => setName(e.target.value)} required autoFocus/>
                    </div>
                    <div className="rp-field">
                      <label className="rp-label">Email Address</label>
                      <input className="rp-input" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required/>
                    </div>
                    <div className="rp-field">
                      <label className="rp-label">Password</label>
                      <input className="rp-input" type="password" placeholder="Min 18 chars, 1 Upper, 1 Number, 1 Symbol" value={password} onChange={e => setPassword(e.target.value)} required/>
                      {/* Password strength bars */}
                      <div className="pw-strength">
                        {[
                          password.length >= 8,
                          password.length >= 12,
                          /[A-Z]/.test(password) && /[0-9]/.test(password),
                          /[\W_]/.test(password) && password.length >= 18,
                        ].map((met, i) => (
                          <div key={i} className="pw-bar" style={{background: met ? ["#ef4444","#f97316","#eab308","#4ade80"][i] : undefined}}/>
                        ))}
                      </div>
                      <div className="rp-hint">Must be ≥18 characters with uppercase, number, and symbol.</div>
                    </div>
                    <button className="rp-btn" type="submit" disabled={loading}>
                      {loading ? "Creating Account..." : "Create Account →"}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={otpSent ? handleVerifyOTP : handleSendOTP}>
                    {!otpSent ? (
                      <>
                        <div className="rp-field">
                          <label className="rp-label">Full Name</label>
                          <input className="rp-input" type="text" placeholder="e.g. Sparsh Sharma" value={name} onChange={e => setName(e.target.value)} required autoFocus/>
                        </div>
                        <div className="rp-field">
                          <label className="rp-label">Phone Number</label>
                          <input className="rp-input" type="tel" placeholder="98765 43210 (defaults to +91)" value={phone} onChange={e => setPhone(e.target.value)} required/>
                        </div>
                        <button className="rp-btn" type="submit" disabled={loading}>
                          {loading ? "Requesting Code..." : "Send Verification Code →"}
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="rp-field">
                          <label className="rp-label">Enter 6-Digit Code</label>
                          <input className="rp-input" type="text" inputMode="numeric" pattern="[0-9]*" placeholder="0 0 0  0 0 0" value={otp} onChange={e => setOtp(e.target.value)} maxLength={6} required autoFocus style={{letterSpacing:"8px",fontSize:"22px",textAlign:"center",fontWeight:"700"}}/>
                        </div>
                        <button className="rp-btn" type="submit" disabled={loading}>
                          {loading ? "Verifying..." : "Verify & Complete Signup"}
                        </button>
                        <button type="button" onClick={() => { setOtpSent(false); setOtp(""); }} style={{width:"100%",background:"transparent",border:"none",color:"#666",fontSize:"13px",marginTop:"16px",cursor:"pointer",fontWeight:"500",textDecoration:"underline",fontFamily:"Inter"}}>
                          Wrong number? Go back
                        </button>
                      </>
                    )}
                  </form>
                )}

                <div className="rp-divider">
                  <span className="rp-div-line"/><span className="rp-div-txt">or</span><span className="rp-div-line"/>
                </div>
                <button className="rp-google" onClick={handleGoogle} disabled={googleLoading}>
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

          {!showVerifyScreen && (
            <p className="rp-footer">Already a member?<Link to="/login">Sign In</Link></p>
          )}
        </div>
      </div>
    </>
  );
}
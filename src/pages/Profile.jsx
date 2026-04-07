import { useState, useContext, useRef } from "react";
import { AuthContext } from "../context/AuthContext";
import { auth, db } from "../firebase";
import { updateProfile, signOut, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { STARS } from "../lib/stars";

const CLOUD_NAME = "ddmuer2zp";
const UPLOAD_PRESET = "manshverse_uploads";
const SPARSH_UID = "O3FcnaQA5tgNztbkWc2FLRnYdye2";

const MV_LOGO = (
  <svg width="14" height="14" viewBox="0 0 100 100" fill="none">
    <line x1="50" y1="50" x2="50" y2="18" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"/>
    <line x1="50" y1="50" x2="83" y2="61" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"/>
    <line x1="50" y1="50" x2="28" y2="78" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"/>
    <circle cx="50" cy="50" r="4" fill="#fff"/>
    <circle cx="50" cy="18" r="2.5" fill="#fff"/>
    <circle cx="83" cy="61" r="2.5" fill="#fff"/>
    <circle cx="28" cy="78" r="2.5" fill="#fff"/>
  </svg>
);

export default function Profile() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const imgRef = useRef(null);
  const isCreator = user?.uid === SPARSH_UID;
  const isGoogle = user?.providerData?.[0]?.providerId === "google.com";

  const [name, setName] = useState(user?.displayName || "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photoURL, setPhotoURL] = useState(user?.photoURL || "");
  const [currentPass, setCurrentPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [changingPass, setChangingPass] = useState(false);
  const [signOutConfirm, setSignOutConfirm] = useState(false);

  // Toast
  const [toast, setToast] = useState({ msg: "", type: "success" });
  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: "", type: "success" }), 3500);
  };

  const saveName = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await updateProfile(auth.currentUser, { displayName: name.trim() });
      await setDoc(doc(db, "users", user.uid), { name: name.trim() }, { merge: true });
      showToast("✓ Display name updated.");
    } catch {
      showToast("Failed to update name.", "error");
    }
    setSaving(false);
  };

  const uploadPhoto = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { showToast("Image must be under 5MB.", "error"); return; }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("upload_preset", UPLOAD_PRESET);
      formData.append("folder", "manshverse_avatars");
      const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: "POST", body: formData });
      const data = await res.json();
      if (data.secure_url) {
        await updateProfile(auth.currentUser, { photoURL: data.secure_url });
        await setDoc(doc(db, "users", user.uid), { photoURL: data.secure_url }, { merge: true });
        setPhotoURL(data.secure_url);
        showToast("✓ Profile photo updated.");
      } else {
        showToast("Upload failed. Try again.", "error");
      }
    } catch {
      showToast("Failed to upload photo.", "error");
    }
    setUploading(false);
  };

  const changePassword = async () => {
    if (!currentPass || !newPass) { showToast("Fill both fields.", "error"); return; }
    if (newPass.length < 6) { showToast("New password must be at least 6 characters.", "error"); return; }
    setChangingPass(true);
    try {
      const cred = EmailAuthProvider.credential(user.email, currentPass);
      await reauthenticateWithCredential(auth.currentUser, cred);
      await updatePassword(auth.currentUser, newPass);
      setCurrentPass(""); setNewPass("");
      showToast("✓ Password updated successfully.");
    } catch (err) {
      if (err.code === "auth/wrong-password") showToast("Current password is incorrect.", "error");
      else if (err.code === "auth/too-many-requests") showToast("Too many attempts. Try later.", "error");
      else showToast("Failed to update password.", "error");
    }
    setChangingPass(false);
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body, #root { height: 100%; background: #000; font-family: 'Inter', sans-serif; }
        @keyframes twinkle { 0%,100%{opacity:0.12} 50%{opacity:0.6} }
        @keyframes fadeUp  { from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin    { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }

        .starfield { position: fixed; inset: 0; z-index: 0; overflow: hidden; pointer-events: none; }
        .star { position: absolute; border-radius: 50%; background: #fff; animation: twinkle linear infinite; }

        /* ── TOAST ── */
        .pf-toast {
          position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%);
          padding: 13px 22px; border-radius: 12px; font-size: 14px; font-weight: 600;
          z-index: 999; animation: fadeUp 0.3s ease; white-space: nowrap; max-width: 90vw;
          box-shadow: 0 8px 32px rgba(0,0,0,0.6);
        }
        .pf-toast.success { background: rgba(4,120,87,0.9); border: 1px solid rgba(74,222,128,0.3); color: #4ade80; backdrop-filter: blur(12px); }
        .pf-toast.error   { background: rgba(127,29,29,0.9); border: 1px solid rgba(239,68,68,0.3); color: #fca5a5; backdrop-filter: blur(12px); }

        /* ── LAYOUT ── */
        .pf { min-height: 100vh; background: transparent; color: #fff; display: flex; flex-direction: column; position: relative; z-index: 1; }
        .pf-top {
          display: flex; align-items: center; gap: 14px; padding: 14px 24px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          background: rgba(5,5,8,0.85); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
          position: sticky; top: 0; z-index: 10;
        }
        .pf-back { display: flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 9px 16px; font-size: 13px; color: #888; cursor: pointer; font-family: 'Inter'; transition: all 0.2s; }
        .pf-back:hover { color: #fff; border-color: rgba(255,255,255,0.15); background: rgba(255,255,255,0.07); }
        .pf-brand { display: flex; align-items: center; gap: 10px; font-size: 14px; font-weight: 600; color: #ccc; margin-left: auto; }
        .pf-brand-mark { width: 28px; height: 28px; background: linear-gradient(135deg,#3d1f8a,#1a0d2e); border: 1px solid rgba(124,92,252,0.3); border-radius: 9px; display: flex; align-items: center; justify-content: center; }

        .pf-body { flex: 1; max-width: 560px; margin: 0 auto; width: 100%; padding: 40px 20px 80px; }

        /* ── HERO ── */
        .pf-hero { display: flex; align-items: center; gap: 20px; margin-bottom: 40px; padding: 24px; background: rgba(10,10,15,0.6); backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,0.07); border-radius: 20px; }
        .pf-av-wrap { position: relative; cursor: pointer; flex-shrink: 0; }
        .pf-av { width: 68px; height: 68px; border-radius: 50%; background: linear-gradient(135deg,#3d1f8a,#1a0d2e); border: 2px solid rgba(124,92,252,0.3); display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 700; color: #fff; overflow: hidden; box-shadow: 0 0 20px rgba(124,92,252,0.2); }
        .pf-av img { width: 100%; height: 100%; object-fit: cover; }
        .pf-av-overlay { position: absolute; inset: 0; border-radius: 50%; background: rgba(0,0,0,0.65); display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s; }
        .pf-av-wrap:hover .pf-av-overlay { opacity: 1; }
        .pf-av-spin { position: absolute; inset: 0; border-radius: 50%; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; }
        .pf-hero-name { font-size: 19px; font-weight: 700; color: #fff; letter-spacing: -0.4px; margin-bottom: 4px; }
        .pf-hero-email { font-size: 13px; color: #444; margin-bottom: 10px; word-break: break-all; }
        .pf-badges { display: flex; gap: 7px; flex-wrap: wrap; }
        .pf-badge { font-size: 10.5px; padding: 4px 10px; border-radius: 7px; font-weight: 600; letter-spacing: 0.3px; }
        .pf-badge.creator { background: rgba(124,92,252,0.12); border: 1px solid rgba(124,92,252,0.3); color: #c4b5fd; }
        .pf-badge.google  { background: rgba(74,158,255,0.1);  border: 1px solid rgba(74,158,255,0.2);  color: #74b9ff; }
        .pf-badge.email   { background: rgba(74,222,128,0.1);  border: 1px solid rgba(74,222,128,0.2);  color: #4ade80; }

        /* ── SECTIONS ── */
        .pf-section { margin-bottom: 24px; }
        .pf-sec-label { font-size: 11px; color: #444; letter-spacing: 0.8px; text-transform: uppercase; font-weight: 600; margin-bottom: 12px; padding-left: 2px; }
        .pf-card { background: rgba(8,8,14,0.8); backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,0.07); border-radius: 18px; padding: 24px; }
        .pf-field { margin-bottom: 18px; }
        .pf-field:last-child { margin-bottom: 0; }
        .pf-label { font-size: 11.5px; color: #555; letter-spacing: 0.4px; text-transform: uppercase; font-weight: 600; margin-bottom: 8px; }
        .pf-input { width: 100%; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 13px 16px; font-size: 14px; font-family: 'Inter'; color: #e0e0e0; outline: none; transition: all 0.2s; -webkit-appearance: none; }
        .pf-input::placeholder { color: #333; }
        .pf-input:focus { border-color: rgba(108,71,255,0.5); background: rgba(255,255,255,0.06); box-shadow: 0 0 0 3px rgba(108,71,255,0.08); }
        .pf-input:disabled { opacity: 0.35; cursor: not-allowed; }

        /* ── BUTTONS ── */
        .pf-row { display: flex; align-items: center; gap: 12px; margin-top: 16px; flex-wrap: wrap; }
        .pf-btn { background: #fff; color: #000; border: none; border-radius: 10px; padding: 11px 20px; font-size: 13.5px; font-weight: 700; font-family: 'Inter'; cursor: pointer; transition: all 0.2s; -webkit-tap-highlight-color: transparent; }
        .pf-btn:hover { background: #f0f0f0; }
        .pf-btn:disabled { opacity: 0.35; cursor: not-allowed; }
        .pf-btn.ghost { background: transparent; color: #555; border: 1px solid rgba(255,255,255,0.08); }
        .pf-btn.ghost:hover { color: #bbb; border-color: rgba(255,255,255,0.15); background: rgba(255,255,255,0.04); }
        .pf-btn.danger { background: rgba(239,68,68,0.1); color: #fca5a5; border: 1px solid rgba(239,68,68,0.22); }
        .pf-btn.danger:hover { background: rgba(239,68,68,0.18); }

        /* ── INFO ROWS ── */
        .pf-info-row { display: flex; align-items: center; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.04); gap: 12px; }
        .pf-info-row:last-child { border-bottom: none; padding-bottom: 0; }
        .pf-info-k { font-size: 13px; color: #444; flex-shrink: 0; }
        .pf-info-v { font-size: 13px; color: #666; text-align: right; word-break: break-all; }

        /* ── GOOGLE NOTE ── */
        .pf-google-note { font-size: 13px; color: #444; line-height: 1.7; padding: 14px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: 10px; }

        /* ── DANGER CARD ── */
        .pf-danger-card { background: rgba(127,29,29,0.07); border: 1px solid rgba(239,68,68,0.14); border-radius: 18px; padding: 24px; }
        .pf-danger-title { font-size: 14px; font-weight: 600; color: #fca5a5; margin-bottom: 6px; }
        .pf-danger-desc  { font-size: 13px; color: rgba(107,36,36,1); line-height: 1.6; margin-bottom: 18px; }

        /* ── SIGN OUT CONFIRM ── */
        .so-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.8); backdrop-filter: blur(10px); display: flex; align-items: center; justify-content: center; z-index: 800; padding: 20px; }
        .so-box { background: rgba(10,10,16,0.98); border: 1px solid rgba(255,255,255,0.1); border-radius: 20px; padding: 32px; max-width: 360px; width: 100%; }
        .so-title { font-size: 18px; font-weight: 700; color: #fff; margin-bottom: 10px; }
        .so-desc  { font-size: 13.5px; color: #555; line-height: 1.6; margin-bottom: 24px; }
        .so-btns  { display: flex; gap: 10px; }

        /* ── FOOTER ── */
        .pf-foot { text-align: center; padding: 24px; border-top: 1px solid rgba(255,255,255,0.04); }
        .pf-foot-txt { font-size: 11px; color: #222; letter-spacing: 0.8px; text-transform: uppercase; }

        @media(max-width:480px){
          .pf-body { padding: 24px 16px 80px; }
          .pf-hero { flex-direction: column; text-align: center; }
          .pf-badges { justify-content: center; }
        }
      `}</style>

      {/* Toast */}
      {toast.msg && <div className={`pf-toast ${toast.type}`}>{toast.msg}</div>}

      {/* Sign Out Confirm */}
      {signOutConfirm && (
        <div className="so-overlay" onClick={() => setSignOutConfirm(false)}>
          <div className="so-box" onClick={e => e.stopPropagation()}>
            <div className="so-title">Sign out?</div>
            <div className="so-desc">You'll be signed out of Manshverse on this device.</div>
            <div className="so-btns">
              <button className="pf-btn ghost" style={{flex:1}} onClick={() => setSignOutConfirm(false)}>Cancel</button>
              <button className="pf-btn danger" style={{flex:2}} onClick={() => { signOut(auth); navigate("/login"); }}>Sign Out</button>
            </div>
          </div>
        </div>
      )}

      <div className="starfield">
        {STARS?.map(s => (
          <div key={s.id} className="star" style={{left:s.left,top:s.top,width:s.w,height:s.w,animationDuration:s.dur,animationDelay:s.delay,opacity:s.op}}/>
        ))}
      </div>

      <div className="pf">
        <div className="pf-top">
          <button className="pf-back" onClick={() => navigate("/chat")}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
            Back
          </button>
          <div className="pf-brand">
            <div className="pf-brand-mark">{MV_LOGO}</div>
            Manshverse
          </div>
        </div>

        <div className="pf-body">
          {/* Hero */}
          <div className="pf-hero">
            <div className="pf-av-wrap" onClick={() => imgRef.current?.click()} title="Change photo">
              <div className="pf-av">
                {photoURL ? <img src={photoURL} alt=""/> : (user?.displayName?.[0] || user?.email?.[0] || "U").toUpperCase()}
              </div>
              {uploading ? (
                <div className="pf-av-spin">
                  <svg className="spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" style={{animation:"spin 1s linear infinite"}}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                </div>
              ) : (
                <div className="pf-av-overlay">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                </div>
              )}
            </div>
            <input ref={imgRef} type="file" accept="image/*" style={{display:"none"}} onChange={uploadPhoto}/>
            <div style={{flex:1,minWidth:0}}>
              <div className="pf-hero-name">{user?.displayName || "Anonymous"}</div>
              <div className="pf-hero-email">{user?.email}</div>
              <div className="pf-badges">
                {isCreator && <span className="pf-badge creator">✦ Creator</span>}
                {isGoogle ? <span className="pf-badge google">Google</span> : <span className="pf-badge email">Email</span>}
              </div>
            </div>
          </div>

          {/* Profile */}
          <div className="pf-section">
            <div className="pf-sec-label">Profile</div>
            <div className="pf-card">
              <div className="pf-field">
                <div className="pf-label">Display name</div>
                <input className="pf-input" value={name} onChange={e => setName(e.target.value)} placeholder="Your name"/>
              </div>
              <div className="pf-field">
                <div className="pf-label">Email address</div>
                <input className="pf-input" value={user?.email || ""} disabled/>
              </div>
              <div className="pf-row">
                <button className="pf-btn" onClick={saveName} disabled={saving || !name.trim()}>
                  {saving ? "Saving..." : "Save changes"}
                </button>
              </div>
            </div>
          </div>

          {/* Password */}
          <div className="pf-section">
            <div className="pf-sec-label">Password</div>
            <div className="pf-card">
              {isGoogle ? (
                <p className="pf-google-note">You signed in with Google. Password management is handled through your Google account.</p>
              ) : (
                <>
                  <div className="pf-field">
                    <div className="pf-label">Current password</div>
                    <input className="pf-input" type="password" placeholder="••••••••" value={currentPass} onChange={e => setCurrentPass(e.target.value)}/>
                  </div>
                  <div className="pf-field">
                    <div className="pf-label">New password</div>
                    <input className="pf-input" type="password" placeholder="Min. 6 characters" value={newPass} onChange={e => setNewPass(e.target.value)}/>
                  </div>
                  <div className="pf-row">
                    <button className="pf-btn" onClick={changePassword} disabled={changingPass}>{changingPass ? "Updating..." : "Update password"}</button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Account info */}
          <div className="pf-section">
            <div className="pf-sec-label">Account info</div>
            <div className="pf-card">
              <div className="pf-info-row">
                <span className="pf-info-k">User ID</span>
                <span className="pf-info-v" style={{fontFamily:"monospace",fontSize:"11px"}}>{user?.uid?.slice(0,18)}...</span>
              </div>
              <div className="pf-info-row">
                <span className="pf-info-k">Sign-in method</span>
                <span className="pf-info-v">{isGoogle ? "Google" : "Email & Password"}</span>
              </div>
              <div className="pf-info-row">
                <span className="pf-info-k">Account type</span>
                <span className="pf-info-v" style={{color: isCreator ? "#c4b5fd" : "#555"}}>{isCreator ? "✦ Creator" : "Standard"}</span>
              </div>
              <div className="pf-info-row">
                <span className="pf-info-k">Platform</span>
                <span className="pf-info-v">Manshverse · 14 March 2026</span>
              </div>
            </div>
          </div>

          {/* Sign out */}
          <div className="pf-section">
            <div className="pf-sec-label">Session</div>
            <div className="pf-danger-card">
              <div className="pf-danger-title">Sign out</div>
              <div className="pf-danger-desc">You will be signed out of Manshverse on this device.</div>
              <button className="pf-btn danger" onClick={() => setSignOutConfirm(true)}>Sign out</button>
            </div>
          </div>
        </div>

        <div className="pf-foot">
          <p className="pf-foot-txt">Founded by Sparsh · manshverse@gmail.com · 2026</p>
        </div>
      </div>
    </>
  );
}
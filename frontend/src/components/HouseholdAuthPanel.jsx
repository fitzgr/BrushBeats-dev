import { useCallback, useEffect, useState } from "react";
import {
  isHouseholdAuthConfigured,
  loadVerifiedParentSession,
  registerParent,
  signInParent,
  signOutParent,
  verifyParentEmail
} from "../auth/neonAuthClient";
import { claimHousehold, getOwnedHouseholds } from "../api/client";
import { trySyncHouseholdSnapshot } from "../db/householdSyncService";
import "./HouseholdAuthPanel.css";

function describeEntitlement(entitlement) {
  if (!entitlement) return "";
  if (entitlement.state === "trial") {
    return `Free trial: ${entitlement.trialDaysRemaining} day${entitlement.trialDaysRemaining === 1 ? "" : "s"} remaining`;
  }
  if (entitlement.state === "paid") return "Annual plan active";
  if (entitlement.state === "expired") return "Trial ended — subscription required for cloud sync";
  return "No active household subscription";
}

export default function HouseholdAuthPanel({ household }) {
  const [view, setView] = useState("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [otp, setOtp] = useState("");
  const [parent, setParent] = useState(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [entitlement, setEntitlement] = useState(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);

  const configured = isHouseholdAuthConfigured();

  const refreshSession = useCallback(async () => {
    const session = await loadVerifiedParentSession();
    setParent(session.user);
    return session;
  }, []);

  useEffect(() => {
    if (!configured) return;
    let alive = true;
    loadVerifiedParentSession().then((session) => {
      if (alive) setParent(session.user);
    }).catch(() => {
      if (alive) setParent(null);
    }).finally(() => { if (alive) setChecking(false); });
    return () => { alive = false; };
  }, [configured]);

  if (!configured || !household?.householdId) return null;

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setStatus("");
    try {
      if (view === "sign-up") {
        await registerParent({ name: name.trim() || "Parent", email: email.trim(), password });
        setView("verify");
        setStatus("An email verification code was requested. Enter the code sent to your inbox.");
      } else if (view === "verify") {
        await verifyParentEmail({ email: email.trim(), code: otp.trim() });
        setView("sign-in");
        setStatus("Email verified. Sign in to connect your family.");
      } else {
        await signInParent({ email: email.trim(), password });
        const session = await refreshSession();
        if (!session.user) {
          setStatus("Sign-in was processed, but email verification is still required.");
        } else if (!session.jwt) {
          setStatus("Signed in, but this browser cannot obtain a secure cloud token. Cloud sync is unavailable.");
        } else {
          setStatus("Signed in. Select Connect household to start your family trial.");
        }
      }
    } catch (err) {
      setError(err.message || "Unable to complete sign-in");
    } finally {
      setBusy(false);
    }
  }

  async function connectHousehold() {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const owned = await getOwnedHouseholds();
      const matches = owned.households?.filter((row) => row.householdId === household.householdId) || [];
      const result = matches.length
        ? matches[0]
        : await claimHousehold({
            householdId: household.householdId,
            householdName: household.householdName || "Brush Beats Household"
          });
      setEntitlement(result.entitlement);
      if (!result.entitlement?.allowed) {
        setStatus(describeEntitlement(result.entitlement));
        return;
      }
      const synced = await trySyncHouseholdSnapshot(household.householdId);
      if (synced.ok) {
        setStatus("This household is connected. Cloud sync completed successfully.");
      } else {
        setStatus("Household linked, but cloud sync has not completed. Local family records are preserved.");
      }
    } catch (err) {
      setError(err.message || "Could not connect household");
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    setBusy(true);
    setError("");
    try {
      await signOutParent();
      setParent(null);
      setEntitlement(null);
      setPassword("");
      setStatus("Signed out. Family brushing records remain on this device.");
    } catch (err) {
      setError(err.message || "Could not sign out");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="household-auth-panel" aria-labelledby="household-auth-title">
      <div className="household-auth-heading">
        <div>
          <p className="household-auth-eyebrow">Family account</p>
          <h2 id="household-auth-title">Keep your family brushing together</h2>
          <p>One parent account manages the whole household. Children do not need email addresses.</p>
        </div>
      </div>
      {checking ? <p>Checking sign-in…</p> : parent ? (
        <div className="household-auth-signed-in">
          <p>Signed in as <strong>{parent.email}</strong></p>
          <p>Your household ID stays private and cannot be used alone to sign in.</p>
          <div className="household-auth-actions">
            <button className="action-btn" type="button" disabled={busy} onClick={connectHousehold}>
              {busy ? "Connecting…" : "Connect this household"}
            </button>
            <button className="action-btn secondary" type="button" disabled={busy} onClick={handleSignOut}>
              Sign out
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="household-auth-actions">
            <button className={view === "sign-in" ? "action-btn" : "action-btn secondary"} type="button" onClick={() => { setView("sign-in"); setError(""); }}>
              Sign in
            </button>
            <button className={view === "sign-up" ? "action-btn" : "action-btn secondary"} type="button" onClick={() => { setView("sign-up"); setError(""); }}>
              Create account
            </button>
          </div>
          <form className="household-auth-form" onSubmit={handleSubmit}>
            {view === "sign-up" && (
              <label>
                <span>Parent name</span>
                <input type="text" autoComplete="name" value={name} maxLength={80} required onChange={(event) => setName(event.target.value)} />
              </label>
            )}
            <label>
              <span>Parent email</span>
              <input type="email" autoComplete="email" value={email} required onChange={(event) => setEmail(event.target.value)} />
            </label>
            {view === "verify" ? (
              <label>
                <span>Email verification code</span>
                <input type="text" inputMode="numeric" autoComplete="one-time-code" value={otp} required onChange={(event) => setOtp(event.target.value)} />
              </label>
            ) : (
              <label>
                <span>Password</span>
                <input type="password" autoComplete={view === "sign-up" ? "new-password" : "current-password"} value={password} required minLength={8} onChange={(event) => setPassword(event.target.value)} />
              </label>
            )}
            <div className="household-auth-actions">
              <button className="action-btn" type="submit" disabled={busy}>
                {busy ? "Working…" : view === "verify" ? "Verify email" : view === "sign-up" ? "Create parent account" : "Sign in"}
              </button>
              {view === "verify" && (
                <button className="action-btn secondary" type="button" onClick={() => setView("sign-in")}>Back to sign-in</button>
              )}
            </div>
          </form>
        </>
      )}
      {entitlement && <p className="household-auth-entitlement">{describeEntitlement(entitlement)}</p>}
      {status && <p className="household-auth-status" role="status">{status}</p>}
      {error && <p className="household-auth-error" role="alert">{error}</p>}
      <small>60-day household trial. After the trial, cloud access costs £4.99 per year. Payment setup is coming next.</small>
    </section>
  );
}

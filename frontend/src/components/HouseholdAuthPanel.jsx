import { useCallback, useEffect, useState } from "react";
import {
  isHouseholdAuthConfigured,
  loadVerifiedParentSession,
  registerParent,
  sendParentEmailVerification,
  signInParent,
  signOutParent,
  verifyParentEmail
} from "../auth/neonAuthClient";
import { claimHousehold, getOwnedHouseholds } from "../api/client";
import { trySyncHouseholdSnapshot, tryHydrateHouseholdFromCloud } from "../db/householdSyncService";
import { getHousehold, getUsersByHousehold, selectLocalHousehold, setActiveUser, setAppSetting } from "../db/storeHelpers";
import { nowIso } from "../db/indexedDbService";
import "./HouseholdAuthPanel.css";

function describeEntitlement(entitlement) {
  if (!entitlement) return "";
  if (entitlement.state === "trial") {
    const remaining = entitlement.trialDaysRemaining;
    const duration = `${remaining} day${remaining === 1 ? "" : "s"} remaining`;
    return entitlement.reminderDue
      ? `Trial ending soon — ${duration}. You can review your annual subscription options.`
      : `Free household trial: ${duration}`;
  }
  if (entitlement.state === "paid") return "Annual plan active";
  if (entitlement.state === "expired") return "Trial ended — subscription required for cloud sync";
  return "No active household subscription";
}

export default function HouseholdAuthPanel({ household }) {
  const [view, setView] = useState("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [name, setName] = useState("");
  const [otp, setOtp] = useState("");
  const [parent, setParent] = useState(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [connectionDiagnostics, setConnectionDiagnostics] = useState(null);
  const [entitlement, setEntitlement] = useState(null);
  const [ownedHouseholds, setOwnedHouseholds] = useState([]);
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
        setPasswordVisible(false);
        setStatus("An email verification code was requested. Enter the code sent to your inbox.");
      } else if (view === "verify") {
        await verifyParentEmail({ email: email.trim(), code: otp.trim() });
        setView("sign-in");
        setPasswordVisible(false);
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

  async function resendEmailVerification() {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await sendParentEmailVerification({ email: email.trim() });
      setStatus("If this email is registered and unverified, a fresh code has been sent.");
    } catch (err) {
      setError(err.message || "Unable to send a new code");
    } finally {
      setBusy(false);
    }
  }

  async function connectHousehold() {
    let stage = "List cloud households";
    setBusy(true);
    setError("");
    setStatus("");
    setConnectionDiagnostics(null);
    try {
      const owned = await getOwnedHouseholds();
      setOwnedHouseholds(Array.isArray(owned.households) ? owned.households : []);
      const matches = owned.households?.filter((row) => row.householdId === household.householdId) || [];

      let result = matches[0];
      if (!result) {
        stage = "Claim household and start trial";
        result = await claimHousehold({
          householdId: household.householdId,
          householdName: household.householdName || "Brush Beats Household"
        });
      }

      setEntitlement(result.entitlement);
      if (!result.entitlement?.allowed) {
        setStatus(describeEntitlement(result.entitlement));
        setConnectionDiagnostics({
          stage,
          status: "Not provided",
          code: "entitlement_not_allowed",
          message: "Cloud access has not been granted."
        });
        return;
      }

      stage = "Synchronize family members";
      const synced = await trySyncHouseholdSnapshot(household.householdId);
      if (synced.ok) {
        setStatus("This household is connected. Cloud sync completed successfully.");
      } else {
        setStatus("Household linked, but cloud sync has not completed. Local family records are preserved.");
        setConnectionDiagnostics({
          stage,
          status: synced.error?.status ?? "Not provided",
          code: synced.error?.code || synced.reason || "sync_not_completed",
          message: synced.error?.message || "The cloud sync was skipped or incomplete."
        });
      }
    } catch (err) {
      setError(err.message || "Could not connect household");
      // Show only request stage and sanitized client error metadata.
      // Never display credentials, JWTs, request payloads, or household UUIDs.
      setConnectionDiagnostics({
        stage,
        status: err.status ?? "Not provided",
        code: err.code || "unclassified",
        message: err.message || "The request did not succeed."
      });
    } finally {
      setBusy(false);
    }
  }

  async function listParentHouseholds() {
    setBusy(true);
    setError("");
    try {
      const response = await getOwnedHouseholds();
      setOwnedHouseholds(Array.isArray(response.households) ? response.households : []);
      setStatus("Select a family to restore. This device's existing household will be kept.");
    } catch (err) {
      setError(err.message || "Could not list your households");
    } finally {
      setBusy(false);
    }
  }

  async function restoreHousehold(householdId) {
    if (!householdId || householdId === household.householdId) {
      setStatus("This household is already open on this device.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      // If this device already has that household, select its local copy.
      // Never overwrite its unsynced profiles with a possibly older snapshot.
      const existingLocal = await getHousehold(householdId);
      if (!existingLocal) {
        const result = await tryHydrateHouseholdFromCloud(householdId);
        if (!result?.ok || !result.household) {
          throw new Error("The family could not be restored. Existing households were preserved.");
        }
      }
      const members = await getUsersByHousehold(householdId);
      const active = members.find((item) => item.userId === result.household.activeUserId) ||
        members.find((item) => item.isActive) || members[0];
      if (!active) throw new Error("The cloud household has no usable profiles to restore.");
      await selectLocalHousehold(householdId);
      await setActiveUser(active.userId, householdId);
      await setAppSetting("system.householdOnboarding", {
        completedAt: nowIso(),
        householdId,
        userId: active.userId,
        additionalUserIds: members.filter((item) => item.userId !== active.userId).map((item) => item.userId),
        reviewSource: "verified-cloud-restore",
        reviewedMigration: false
      });
      setStatus("Household restored. Refreshing family profiles…");
      window.location.reload();
    } catch (err) {
      setError(err.message || "Could not restore household");
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
      setOwnedHouseholds([]);
      setPassword("");
      setPasswordVisible(false);
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
            <button className="action-btn secondary" type="button" disabled={busy} onClick={listParentHouseholds}>
              Restore on this device
            </button>
            <button className="action-btn secondary" type="button" disabled={busy} onClick={handleSignOut}>
              Sign out
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="household-auth-actions">
            <button className={view === "sign-in" ? "action-btn" : "action-btn secondary"} type="button" onClick={() => { setView("sign-in"); setPasswordVisible(false); setError(""); }}>
              Sign in
            </button>
            <button className={view === "sign-up" ? "action-btn" : "action-btn secondary"} type="button" onClick={() => { setView("sign-up"); setPasswordVisible(false); setError(""); }}>
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
              <div className="household-auth-password-field">
                <label htmlFor="household-parent-password">Password</label>
                <div className="household-auth-password-control">
                  <input id="household-parent-password" type={passwordVisible ? "text" : "password"} autoComplete={view === "sign-up" ? "new-password" : "current-password"} value={password} required minLength={8} onChange={(event) => setPassword(event.target.value)} />
                  <button
                    type="button"
                    className="household-auth-password-toggle"
                    aria-controls="household-parent-password"
                    aria-label={passwordVisible ? "Hide password" : "Show password"}
                    aria-pressed={passwordVisible}
                    onClick={() => setPasswordVisible((visible) => !visible)}
                  >
                    {passwordVisible ? (
                      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10.6 5.1A10.8 10.8 0 0 1 12 5c5.2 0 8.8 4.2 10 7a12.8 12.8 0 0 1-3.3 4.8" />
                        <path d="M6.1 6.1A13.3 13.3 0 0 0 2 12c1.2 2.8 4.8 7 10 7a10.7 10.7 0 0 0 4.8-1.1" />
                        <path d="M10 10a3 3 0 0 0 4 4" />
                        <path d="M3 3l18 18" />
                      </svg>
                    ) : (
                      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            )}
            <div className="household-auth-actions">
              <button className="action-btn" type="submit" disabled={busy}>
                {busy ? "Working…" : view === "verify" ? "Verify email" : view === "sign-up" ? "Create parent account" : "Sign in"}
              </button>
              {view === "verify" && (
                <button className="action-btn secondary" type="button" disabled={busy || !email.trim()}
                  onClick={resendEmailVerification}>Resend code</button>
              )}
              {view === "sign-in" && (
                <button className="action-btn secondary" type="button" onClick={() => { setView("verify"); setPasswordVisible(false); setError(""); }}>
                  Verify email
                </button>
              )}
            </div>
          </form>
        </>
      )}
      {parent && ownedHouseholds.some((item) => item.householdId !== household.householdId) && (
        <div className="household-auth-restore">
          <strong>Your existing cloud households</strong>
          <p>Restoring a different household keeps this device's current family records; it does not erase them.</p>
          {ownedHouseholds.filter((item) => item.householdId !== household.householdId).map((item) => (
            <div className="household-auth-restore-row" key={item.householdId}>
              <div><strong>{item.householdName || "Brush Beats Household"}</strong><br />
                <small>{describeEntitlement(item.entitlement)}</small>
              </div>
              <button className="action-btn secondary" type="button" disabled={busy}
                onClick={() => restoreHousehold(item.householdId)}>Restore</button>
            </div>
          ))}
        </div>
      )}
      {entitlement && <p className="household-auth-entitlement">{describeEntitlement(entitlement)}</p>}
      {status && <p className="household-auth-status" role="status">{status}</p>}
      {error && <p className="household-auth-error" role="alert">{error}</p>}
      {connectionDiagnostics && (
        <div className="household-auth-debug" role="status">
          <strong>Dev connection diagnostics</strong>
          <p>Step: {connectionDiagnostics.stage}</p>
          <p>HTTP status: {connectionDiagnostics.status} · Error code: {connectionDiagnostics.code}</p>
          <p>Message: {connectionDiagnostics.message}</p>
          <small>Safe to screenshot: no passwords, tokens, or household IDs are shown here.</small>
        </div>
      )}
      <small>60-day household trial. After the trial, cloud access costs £4.99 per year. Payment setup is coming next.</small>
    </section>
  );
}

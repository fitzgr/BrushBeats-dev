import { useEffect, useState } from "react";
import {
  acceptHouseholdInvitation,
  createHouseholdInvitation,
  getHouseholdAccountMembers,
  revokeHouseholdAccountMember
} from "../api/client";

const ENABLED = import.meta.env.VITE_ENABLE_HOUSEHOLD_INVITATIONS === "true";

/**
 * Verified adult invites only. A household owner can copy a one-use invitation
 * link. The recipient must sign in using the exact verified invited email.
 * This does NOT enroll devices or authorize member cloud writes.
 */
export default function HouseholdInvitationPanel({ householdId, role, onAccepted }) {
  const [recipientEmail, setRecipientEmail] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [inviteToken, setInviteToken] = useState("");
  const [members, setMembers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ENABLED || typeof window === "undefined") return;
    // Keep links in URL fragments, not query strings or web-server logs.
    // Clear the fragment as soon as it is consumed by the app.
    const hash = window.location.hash.match(/^#invite=([a-f0-9]{64})$/);
    if (!hash) return;
    setInviteToken(hash[1]);
    window.history.replaceState({}, "", window.location.pathname + window.location.search);
  }, []);

  if (!ENABLED || !householdId) return null;

  async function createInvite(event) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    setError("");
    setInviteLink("");
    try {
      const invite = await createHouseholdInvitation(householdId, recipientEmail.trim());
      const link = window.location.origin + window.location.pathname + window.location.search
        + "#invite=" + invite.token;
      setInviteLink(link);
      setRecipientEmail("");
      setStatus("Invitation created. Copy the private link and send it to the intended adult. The link expires in 72 hours.");
    } catch (err) { setError(err.message || "Could not create invitation"); }
    finally { setBusy(false); }
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setStatus("Private invitation link copied. Share it only with the intended recipient.");
    } catch {
      setStatus("Copy the invitation link from the field. The link is visible only until you leave this page.");
    }
  }

  async function acceptInvite(event) {
    event.preventDefault();
    if (!/^[a-f0-9]{64}$/.test(inviteToken.trim())) {
      setError("Please use the full invitation link or invitation code.");
      return;
    }
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const accepted = await acceptHouseholdInvitation(inviteToken.trim());
      setInviteToken("");
      setStatus("Invitation accepted. Select Restore on this device to open your new household.");
      if (typeof onAccepted === "function") await onAccepted(accepted.householdId);
    } catch (err) { setError(err.message || "Invitation could not be accepted"); }
    finally { setBusy(false); }
  }

  async function listMembers() {
    setBusy(true);
    setError("");
    try {
      const result = await getHouseholdAccountMembers(householdId);
      setMembers(Array.isArray(result.members) ? result.members : []);
    } catch (err) { setError(err.message || "Could not load family members"); }
    finally { setBusy(false); }
  }

  async function removeMember(accountId) {
    setBusy(true);
    setError("");
    try {
      await revokeHouseholdAccountMember(householdId, accountId);
      setMembers((current) => current.filter((member) => member.account_id !== accountId));
      setStatus("This adult's cloud family access was revoked.");
    } catch (err) { setError(err.message || "Could not revoke family member"); }
    finally { setBusy(false); }
  }

  return (
    <section className="household-auth-restore" aria-label="Family invitations">
      <strong>Family invitations</strong>
      <p>Adults must use a verified account matching their invitation. Children can continue using owner-managed brushing profiles; independent device enrollment is coming later.</p>
      <form className="household-auth-form" onSubmit={acceptInvite}>
        <label>
          <span>Accept an invitation code</span>
          <input
            type="text"
            autoComplete="off"
            spellCheck={false}
            maxLength={64}
            value={inviteToken}
            onChange={(event) => setInviteToken(event.target.value.toLowerCase().trim())}
            placeholder="Paste the code from your invitation"
          />
        </label>
        <button className="action-btn secondary" type="submit" disabled={busy || !inviteToken}>
          Accept family invitation
        </button>
      </form>
      {role === "owner" && (
        <>
          <form className="household-auth-form" onSubmit={createInvite}>
            <label>
              <span>Invite another adult in your household</span>
              <input type="email" required autoComplete="off" maxLength={254}
                value={recipientEmail} onChange={(event) => setRecipientEmail(event.target.value)} />
            </label>
            <button className="action-btn" type="submit" disabled={busy || !recipientEmail.trim()}>
              Create private invitation link
            </button>
          </form>
          {inviteLink && (
            <div className="household-auth-form">
              <label>
                <span>Single-use invitation link — share privately</span>
                <input readOnly value={inviteLink} onFocus={(event) => event.target.select()} />
              </label>
              <button className="action-btn secondary" type="button" onClick={copyInvite}>Copy invitation link</button>
            </div>
          )}
          <button className="action-btn secondary" type="button" disabled={busy} onClick={listMembers}>
            View enrolled adults
          </button>
          {members.map((member) => (
            <div className="household-auth-restore-row" key={member.account_id}>
              <span>{member.display_name || member.email || "Adult account"}</span>
              <button className="action-btn secondary" type="button" disabled={busy}
                onClick={() => removeMember(member.account_id)}>Revoke access</button>
            </div>
          ))}
        </>
      )}
      {status && <p className="household-auth-status" role="status">{status}</p>}
      {error && <p className="household-auth-error" role="alert">{error}</p>}
    </section>
  );
}

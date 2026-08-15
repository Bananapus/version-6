"use client";

import {
  EMPTY_SHIPPING_ADDRESS,
  addressToMultiline,
  rosterBindingFromSnapshot,
  rosterBindingsEqual,
  validateShippingAddress,
} from "@/domain/fulfillment";
import type {
  FulfillmentStage,
  Participant,
  RecipientRosterBinding,
  RecipientRosterSnapshot,
  ShippingAddress,
} from "@/domain/model";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "./Icon";

interface ShippingDialogProps {
  open: boolean;
  currentAddress?: ShippingAddress;
  currentVersion?: number;
  recipients: Participant[];
  roster: RecipientRosterSnapshot;
  fulfillmentStage: FulfillmentStage;
  mode?: "demo" | "shared";
  onClose: () => void;
  onSubmit: (address: ShippingAddress, approvedRoster: RecipientRosterBinding) => Promise<boolean>;
}

type DialogStep = "edit" | "review";

const FICTIONAL_DEMO_ADDRESS: ShippingAddress = {
  recipientName: "Avery Example",
  line1: "123 Demo Street",
  line2: "Apartment 4B",
  city: "São Paulo",
  region: "SP",
  postalCode: "01000-000",
  country: "Brazil",
  deliveryNote: "Leave with the front desk.",
};

export function ShippingDialog({
  open,
  currentAddress,
  currentVersion,
  recipients,
  roster,
  fulfillmentStage,
  mode = "demo",
  onClose,
  onSubmit,
}: ShippingDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const initialAddress = currentAddress ?? EMPTY_SHIPPING_ADDRESS;
  const [step, setStep] = useState<DialogStep>("edit");
  const [address, setAddress] = useState<ShippingAddress>(() =>
    currentAddress ? { ...currentAddress } : { ...EMPTY_SHIPPING_ADDRESS },
  );
  const [submitting, setSubmitting] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [submissionFailed, setSubmissionFailed] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [approvedRoster, setApprovedRoster] = useState<RecipientRosterBinding | null>(null);
  const validation = useMemo(() => validateShippingAddress(address), [address]);
  const dirty = JSON.stringify(address) !== JSON.stringify(initialAddress);
  const currentRosterBinding = rosterBindingFromSnapshot(roster);
  const approvalStillCurrent = Boolean(
    approvedRoster && rosterBindingsEqual(approvedRoster, currentRosterBinding),
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function update<K extends keyof ShippingAddress>(field: K, value: ShippingAddress[K]) {
    setSubmissionFailed(false);
    setConfirmDiscard(false);
    setAddress((current) => ({ ...current, [field]: value }));
  }

  function closeDialog(force = false) {
    if (submitting) return;
    if (dirty && !force) {
      setConfirmDiscard(true);
      return;
    }

    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
    onClose();
  }

  function review() {
    setAttempted(true);
    if (!validation.valid) {
      requestAnimationFrame(() => {
        formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      });
      return;
    }
    setApprovedRoster(currentRosterBinding);
    setStep("review");
  }

  async function submit() {
    if (!approvedRoster || !rosterBindingsEqual(approvedRoster, currentRosterBinding)) {
      setSubmissionFailed(false);
      return;
    }
    setSubmitting(true);
    try {
      const shared = await onSubmit(address, approvedRoster);
      if (shared) closeDialog(true);
      else setSubmissionFailed(true);
    } catch {
      setSubmissionFailed(true);
    } finally {
      setSubmitting(false);
    }
  }

  const isUpdate = Boolean(currentAddress);
  const isCorrection = fulfillmentStage === "shipped";
  const version = (currentVersion ?? 0) + 1;

  return (
    <dialog
      aria-labelledby="shipping-dialog-title"
      className="modal-dialog"
      onCancel={(event) => {
        event.preventDefault();
        closeDialog();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) closeDialog();
      }}
      onKeyDown={trapDialogFocus}
      ref={dialogRef}
    >
      <form
        autoComplete={mode === "shared" ? "off" : undefined}
        className="modal-card"
        noValidate
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          if (step === "edit") review();
          else void submit();
        }}
        ref={formRef}
      >
        <header className="modal-header">
          <div>
            <p className="eyebrow">{isCorrection ? `Post-shipment correction · version ${version}` : `${mode === "shared" ? "Test fulfillment detail" : "Private fulfillment detail"} · version ${version}`}</p>
            <h2 id="shipping-dialog-title">{isCorrection ? "Share delivery correction" : isUpdate ? "Update shipping address" : "Share shipping address"}</h2>
          </div>
          <button className="icon-button" aria-label="Close shipping address form" disabled={submitting} onClick={() => closeDialog()} type="button">
            <Icon name="x" />
          </button>
        </header>

        {step === "edit" ? (
          <div className="modal-body">
            <div className="privacy-callout compact-callout">
              <Icon name={mode === "shared" ? "info" : "shield"} size={20} />
              <div>
                <strong>{mode === "shared" ? "HTTP LAN test · fictional address only" : "Shared only with the named project team"}</strong>
                <p>{mode === "shared" ? "This simulated payload is not end-to-end encrypted and is stored by the development service." : "It will not appear in thread previews, notifications, URLs, or analytics."}</p>
              </div>
            </div>

            {fulfillmentStage === "shipped" ? (
              <div className="warning-callout">
                <Icon name="info" size={20} />
                <p>This order is already shipped. This sends a separate correction to the project team; it does not change the address bound to the shipment or reroute the package.</p>
              </div>
            ) : null}

            {attempted && !validation.valid ? (
              <div className="form-error-summary" id="shipping-form-error-summary" role="alert">
                <Icon name="info" size={18} />
                <p>Complete the highlighted required fields before reviewing recipients.</p>
              </div>
            ) : null}

            {!currentAddress ? (
              <button
                className="demo-fill-button"
                onClick={() => {
                  setSubmissionFailed(false);
                  setConfirmDiscard(false);
                  setAddress({ ...FICTIONAL_DEMO_ADDRESS });
                }}
                type="button"
              >
                Fill with fictional demo data
              </button>
            ) : null}

            <div className="form-grid">
              <Field
                autoComplete={mode === "shared" ? "off" : "name"}
                error={attempted ? validation.errors.recipientName : undefined}
                label="Recipient name"
                name="recipientName"
                onChange={(value) => update("recipientName", value)}
                value={address.recipientName}
              />
              <Field
                autoComplete={mode === "shared" ? "off" : "country-name"}
                error={attempted ? validation.errors.country : undefined}
                label="Country"
                name="country"
                onChange={(value) => update("country", value)}
                value={address.country}
              />
              <Field
                autoComplete={mode === "shared" ? "off" : "address-line1"}
                error={attempted ? validation.errors.line1 : undefined}
                label="Address line 1"
                name="line1"
                onChange={(value) => update("line1", value)}
                value={address.line1}
                wide
              />
              <Field
                autoComplete={mode === "shared" ? "off" : "address-line2"}
                label="Address line 2"
                name="line2"
                onChange={(value) => update("line2", value)}
                optional
                value={address.line2}
                wide
              />
              <Field
                autoComplete={mode === "shared" ? "off" : "address-level2"}
                error={attempted ? validation.errors.city : undefined}
                label="City"
                name="city"
                onChange={(value) => update("city", value)}
                value={address.city}
              />
              <Field
                autoComplete={mode === "shared" ? "off" : "address-level1"}
                error={attempted ? validation.errors.region : undefined}
                label="State / region"
                name="region"
                onChange={(value) => update("region", value)}
                optional
                value={address.region}
              />
              <Field
                autoComplete={mode === "shared" ? "off" : "postal-code"}
                error={attempted ? validation.errors.postalCode : undefined}
                label="Postal code"
                name="postalCode"
                onChange={(value) => update("postalCode", value)}
                optional
                value={address.postalCode}
              />
              <label className="field wide-field" htmlFor="shipping-delivery-note">
                <span>Delivery instructions <small>Optional</small></span>
                <textarea
                  aria-describedby="shipping-delivery-note-count"
                  autoComplete={mode === "shared" ? "off" : undefined}
                  id="shipping-delivery-note"
                  maxLength={240}
                  name="deliveryNote"
                  onChange={(event) => update("deliveryNote", event.target.value)}
                  placeholder="Gate code, safe place, accessibility note…"
                  rows={3}
                  value={address.deliveryNote}
                />
                <small id="shipping-delivery-note-count">{address.deliveryNote.length}/240</small>
              </label>
            </div>

            <p className="form-footnote">{mode === "shared" ? "This draft stays in memory until sent. Once sent, the simulated payload is stored for the development session. Use fictional details only." : "For this prototype, drafts stay only in memory and reset when the page reloads. Phone and email are intentionally excluded."}</p>
          </div>
        ) : (
          <div
            aria-label="Shipping address and recipient review"
            className="modal-body review-body"
            role="region"
            tabIndex={0}
          >
            <div className="review-address">
              <span className="review-icon"><Icon name="map" /></span>
              <div>
                <p className="eyebrow">Review before sharing</p>
                <pre>{addressToMultiline(address)}</pre>
              </div>
            </div>

            <section className="security-confirmation" aria-labelledby="recipient-security-title">
              <header className="security-confirmation-header">
                <span className="security-confirmation-marker"><Icon name="shield" size={13} /> Messaging service check</span>
                <p id="recipient-security-title">Confirm exactly who receives this private detail.</p>
              </header>

              <div className="recipient-review">
                <div className="recipient-review-heading">
                  <p className="eyebrow">{mode === "shared" ? "These test-session roles receive it" : "These verified devices can view it"}</p>
                  <small>Roster {roster.rosterVersion} · {mode === "shared" ? "simulation revision" : "secure-channel epoch"} {roster.mlsEpoch}</small>
                </div>
                {roster.devices.map((device) => {
                  const participant = recipients.find((entry) => entry.id === device.participantId);
                  return (
                  <div className="recipient-row" key={device.deviceId}>
                    <span className="avatar small-avatar">{participant?.initial ?? "S"}</span>
                    <span><strong>{device.displayName}</strong><small>{mode === "shared" ? "Test ID" : "Credential"} …{device.deviceFingerprint.slice(-8)}</small></span>
                    <span className="verified-mini">{mode === "demo" ? <Icon name="check" size={12} /> : null} {mode === "shared" ? (device.role === "customer" ? "Customer role" : "Project role") : (device.role === "customer" ? "Your device" : "Named staff")}</span>
                  </div>
                  );
                })}
              </div>

              {!approvalStillCurrent ? (
                <div className="security-roster-alert" role="alert">
                  <Icon name="info" size={18} />
                  <p>The recipient roster changed after review. Go back and review the current devices before sharing.</p>
                </div>
              ) : null}

              <div className="security-copy-limit">
                <Icon name="info" size={20} />
                <p>Project staff may need to copy this address into a carrier system. Updating it supersedes this version but cannot erase copies already viewed or used.</p>
              </div>
            </section>

            {submissionFailed ? (
              <div className="form-error-summary" role="alert">
                <Icon name="info" size={18} />
                <p>The address was not shared. Your draft is still here; check the connection and try again.</p>
              </div>
            ) : null}
          </div>
        )}

        <footer className={`modal-footer${confirmDiscard ? " confirm-discard" : ""}`}>
          {confirmDiscard ? (
            <>
              <p role="status">Discard this unshared address draft?</p>
              <button className="button secondary" onClick={() => setConfirmDiscard(false)} type="button">Keep editing</button>
              <button className="button danger" onClick={() => closeDialog(true)} type="button">Discard draft</button>
            </>
          ) : step === "edit" ? (
            <>
              <button className="button secondary" onClick={() => closeDialog()} type="button">Cancel</button>
              <button className="button primary" type="submit">Review recipients <Icon name="arrow" /></button>
            </>
          ) : (
            <>
              <button className="button secondary" disabled={submitting} onClick={() => setStep("edit")} type="button">Back</button>
              <button className="button primary" disabled={submitting || !approvalStillCurrent} type="submit">
                {submitting ? "Sharing…" : isCorrection ? "Share correction" : isUpdate ? "Share updated address" : mode === "shared" ? "Send fictional address" : "Share privately"}
                {!submitting ? <Icon name={mode === "shared" ? "send" : "lock"} size={16} /> : null}
              </button>
            </>
          )}
        </footer>
      </form>
    </dialog>
  );
}

function trapDialogFocus(event: KeyboardEvent<HTMLDialogElement>) {
  if (event.key !== "Tab") return;
  const focusable = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => element.getClientRects().length > 0);
  const first = focusable[0];
  const last = focusable.at(-1);
  if (!first || !last) return;

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

interface FieldProps {
  autoComplete: string;
  error?: string;
  label: string;
  name: keyof ShippingAddress;
  onChange: (value: string) => void;
  optional?: boolean;
  value: string;
  wide?: boolean;
}

function Field({ autoComplete, error, label, name, onChange, optional, value, wide }: FieldProps) {
  const id = `shipping-${name}`;
  const errorId = `${id}-error`;
  return (
    <label className={`field${wide ? " wide-field" : ""}`} htmlFor={id}>
      <span>{label} {optional ? <small>Optional</small> : null}</span>
      <input
        aria-describedby={error ? errorId : undefined}
        aria-invalid={Boolean(error)}
        autoComplete={autoComplete}
        id={id}
        name={name}
        onChange={(event) => onChange(event.target.value)}
        required={!optional}
        value={value}
      />
      {error ? <small className="field-error" id={errorId}>{error}</small> : null}
    </label>
  );
}

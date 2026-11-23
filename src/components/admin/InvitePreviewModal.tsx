"use client";

import { useMemo } from "react";
import { MailPreviewModal } from "@/components/ui/MailPreviewModal";
import { buildInviteMessage } from "@/lib/notify/invite-mail";
import { APP_SUBJECT_PREFIX } from "@/lib/notify/send-mail";
import type { UserRole } from "@/lib/types/user-profile";

export interface InvitePreviewInput {
  displayName: string;
  email: string;
  role: UserRole;
  invitedBy: string;
}

/**
 * The invitation mail, shown as the person will get it - nothing is sent. It renders the same
 * `buildInviteMessage` the Send button uses, so the preview cannot drift from the mail.
 */
export function InvitePreviewModal({ input, onClose }: { input: InvitePreviewInput; onClose: () => void }) {
  const { subject, html } = useMemo(() => buildInviteMessage({ ...input, origin: window.location.origin }), [input]);
  return <MailPreviewModal to={input.email} subject={`${APP_SUBJECT_PREFIX} ${subject}`} html={html} onClose={onClose} />;
}

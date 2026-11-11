import { type JSX, useRef } from "react";
import { PermissionCard } from "./PermissionCard";
import { isInstalledAndroidPwa } from "./pushSubscription";

// /settings/notifications (CAL-027 Contract, Block 5): the settings card in
// the state matching this device's permission, and - on anything but an
// installed Android PWA - the addendum, whatever the permission.
export function NotificationsPage(): JSX.Element {
  const heading = useRef<HTMLHeadingElement>(null);
  return (
    <>
      <h1 ref={heading} tabIndex={-1}>
        Notifications
      </h1>
      <PermissionCard
        placement="settings"
        onGone={() => heading.current?.focus()}
      />
      {isInstalledAndroidPwa() ? null : (
        <p>Reminders are only reliable on your phone when the app is closed.</p>
      )}
    </>
  );
}

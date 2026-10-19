import type { Metadata } from "next";
import { AccountPanel } from "@/components/AccountPanel";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Account" };

export default function AccountPage() {
  return (
    <>
      <PageHeader eyebrow="Optional · your choice" title="Your" accent="Account">
        Use Pipewright free in this browser with no sign-in, or sign in with Google to keep your work in the cloud and pick it up on
        any device.
      </PageHeader>
      <AccountPanel />
    </>
  );
}

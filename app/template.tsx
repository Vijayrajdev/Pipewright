import { ViewTransition } from "react";

/** Re-mounts on every navigation, so each page plays the enter/exit transition. */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter="page-enter" exit="page-exit" default="none">
      <div>{children}</div>
    </ViewTransition>
  );
}

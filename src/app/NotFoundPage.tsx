import type { JSX } from "react";
import { Link } from "react-router";

// voice.md, "Not found".
export function NotFoundPage(): JSX.Element {
  return (
    <>
      <h1 tabIndex={-1}>Nothing here</h1>
      <Link to="/">Go to today</Link>
    </>
  );
}

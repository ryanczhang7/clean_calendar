import type { JSX } from "react";
import { createBrowserRouter, RouterProvider } from "react-router";
import { routes } from "./routes";

const router = createBrowserRouter(routes);

export function App(): JSX.Element {
  return <RouterProvider router={router} />;
}

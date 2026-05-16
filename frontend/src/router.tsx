import { createBrowserRouter } from "react-router";
import App from "./App";
import DashboardPage from "./pages/DashboardPage";
import InboxPage from "./pages/InboxPage";
import OpsPage from "./pages/OpsPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "inbox", element: <InboxPage /> },
      { path: "ops", element: <OpsPage /> },
    ],
  },
]);

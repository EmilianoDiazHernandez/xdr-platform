import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/geist";
import "./index.css";
import App from "./App";
import { AuthProvider } from "./auth/AuthContext";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>,
);

import React from "react";
import { BrowserRouter } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { AuthProvider } from "./auth/AuthContext";
import AppRoutes from "./routes/AppRoutes";
import "./App.css";

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <AppRoutes />
        <ToastContainer position="top-center" autoClose={1800} />
      </AuthProvider>
    </BrowserRouter>
  );
}

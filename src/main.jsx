// PENTING: import storage.js paling atas, biar window.storage kepasang
// SEBELUM App.jsx mulai jalan.
import "./storage.js";

import React from "react";
import { createRoot } from "react-dom/client";
import MotorellOps from "./App.jsx";

createRoot(document.getElementById("root")).render(<MotorellOps />);

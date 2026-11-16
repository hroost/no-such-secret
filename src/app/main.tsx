import { createRoot } from "react-dom/client";
import { App, ConfigProvider } from "./App";

createRoot(document.getElementById("root")!).render(<ConfigProvider><App /></ConfigProvider>);

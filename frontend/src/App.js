import "@/App.css";
import { useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Landing from "@/pages/Landing";
import Admin from "@/pages/Admin";
import CutList from "@/pages/CutList";
import { Toaster } from "sonner";
import { initAnalytics } from "@/lib/analytics";

function App() {
  useEffect(() => { initAnalytics(); }, []);
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/cutlist" element={<CutList />} />
          <Route path="/cut-list-optimizer" element={<CutList />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" richColors closeButton />
    </div>
  );
}

export default App;

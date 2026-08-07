// src/components/ExportButton.tsx

import React from "react";
import { motion } from "framer-motion";
import { exportLog } from "../api";

export default function ExportButton() {
  const onClick = () => {
    exportLog().catch(() => {});
  };

  return (
    <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
      <button
        type="button"
        onClick={onClick}
        className="bg-gradient-to-r from-accentLight to-accentDark text-white font-semibold py-3 px-6 rounded-full shadow-2xl hover:shadow-inner transition inline-block"
      >
        Exportar Registro
      </button>
    </motion.div>
  );
}

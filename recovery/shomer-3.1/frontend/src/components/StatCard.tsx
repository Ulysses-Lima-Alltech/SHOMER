// frontend/src/components/StatCard.tsx
import React from "react";
import { motion } from "framer-motion";

interface Props {
  label: string;
  value: number | string; // Aceita tanto number quanto string
  suffix?: string;
  icon?: React.ReactNode;
  color?: string;
  borderColor?: string;
  trend?: "up" | "down" | "stable";
  trendValue?: number;
}

export default function StatCard({
  label,
  value,
  suffix = "",
  icon,
  color = "text-cyan-400",
  borderColor = "border-cyan-400/50",
  trend,
  trendValue,
}: Props) {
  const getTrendIcon = () => {
    if (!trend) return null;

    switch (trend) {
      case "up":
        return <span className="text-green-400 text-xs">↗ +{trendValue}%</span>;
      case "down":
        return <span className="text-red-400 text-xs">↘ -{trendValue}%</span>;
      case "stable":
        return <span className="text-gray-400 text-xs">→ {trendValue}%</span>;
      default:
        return null;
    }
  };

  const formatValue = (val: number | string): string => {
    // Se for string, retorna diretamente
    if (typeof val === "string") {
      return val;
    }

    // Se for number, aplica formatação
    if (val >= 1000000) {
      return (val / 1000000).toFixed(1) + "M";
    } else if (val >= 1000) {
      return (val / 1000).toFixed(1) + "K";
    }
    return val.toString();
  };

  return (
    <motion.div
      className={`relative group bg-gradient-to-br from-gray-900/50 to-gray-800/30 backdrop-blur-sm border ${borderColor} rounded-xl p-6 shadow-lg hover:shadow-xl transition-all duration-300`}
      whileHover={{
        scale: 1.02,
        boxShadow:
          "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
      }}
      whileTap={{ scale: 0.98 }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* Background Glow Effect */}
      <div
        className={`absolute inset-0 bg-gradient-to-br ${
          color?.includes("blue")
            ? "from-blue-500/5 to-cyan-500/5"
            : color?.includes("green")
            ? "from-green-500/5 to-emerald-500/5"
            : color?.includes("purple")
            ? "from-purple-500/5 to-pink-500/5"
            : color?.includes("red")
            ? "from-red-500/5 to-orange-500/5"
            : "from-cyan-500/5 to-blue-500/5"
        } rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300`}
      />

      {/* Content */}
      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {icon && <div className={`${color} opacity-80`}>{icon}</div>}
            <span className="text-sm font-medium text-gray-300 uppercase tracking-wide">
              {label}
            </span>
          </div>

          {/* Trend Indicator */}
          {getTrendIcon()}
        </div>

        {/* Value */}
        <div className="mb-2">
          <span className={`text-4xl font-bold ${color} font-mono`}>
            {formatValue(value)}
          </span>
          {suffix && (
            <span className={`text-lg ${color} opacity-80 ml-1`}>{suffix}</span>
          )}
        </div>

        {/* Progress Bar (Visual Enhancement) */}
        <div className="h-1 bg-gray-700/50 rounded-full overflow-hidden">
          <motion.div
            className={`h-full bg-gradient-to-r ${
              color?.includes("blue")
                ? "from-blue-500 to-cyan-500"
                : color?.includes("green")
                ? "from-green-500 to-emerald-500"
                : color?.includes("purple")
                ? "from-purple-500 to-pink-500"
                : color?.includes("red")
                ? "from-red-500 to-orange-500"
                : "from-cyan-500 to-blue-500"
            }`}
            initial={{ width: 0 }}
            animate={{
              width: typeof value === "number" && value > 0 ? "100%" : "0%",
            }}
            transition={{ duration: 1, delay: 0.2, ease: "easeOut" }}
          />
        </div>

        {/* Additional Info */}
        <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
          <span>Atualizado agora</span>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
            <span>Live</span>
          </div>
        </div>
      </div>

      {/* Hover Effect Border */}
      <div
        className={`absolute inset-0 border-2 ${borderColor} rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none`}
      />
    </motion.div>
  );
}

import React from "react";
import { motion } from "framer-motion";
import { useRef, useEffect, useState } from "react";

export default function Hero() {
  const ref = useRef(null);
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
        }
      },
      { threshold: 0.1 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => {
      if (ref.current) {
        observer.unobserve(ref.current);
      }
    };
  }, []);

  const handleScrollToDemo = () => {
    const section = document.getElementById("demo");
    if (section) {
      section.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <section
      ref={ref}
      className="relative h-screen overflow-hidden bg-gradient-to-br from-black via-[#020617] to-black text-white"
    >
      <div className="absolute inset-0 w-full h-full bg-gradient-to-br from-black via-[#0f172a] to-black bg-400 animate-gradientShift" />
      <div className="relative z-10 flex flex-col items-center justify-center h-full text-center px-6">
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
          className="text-5xl md:text-6xl font-extrabold mb-4"
        >
          <span className="block text-cyan-400">Shomer</span>
          <span className="block text-3xl md:text-4xl text-slate-100">
            Monitoramento Inteligente com IA
          </span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="text-lg md:text-xl text-slate-300 max-w-2xl"
        >
          Veja em tempo real pessoas e rostos sendo detectados pelo nosso MVP
          leve e modular.
        </motion.p>
        <motion.button
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, delay: 0.6 }}
          onClick={handleScrollToDemo}
          className="mt-8 px-8 py-3 bg-cyan-600 text-white font-medium rounded-full shadow-lg hover:bg-cyan-700 transition"
        >
          Ver Demonstração
        </motion.button>
      </div>
    </section>
  );
}

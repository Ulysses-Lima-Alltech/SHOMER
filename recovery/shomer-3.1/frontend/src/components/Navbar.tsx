import React from "react";
import {
  Book,
  Home,
  Code2,
  LogOut,
  User as UserIcon,
  Camera,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

interface NavbarProps {
  user: {
    id: string;
    username: string;
    email: string;
    createdAt: string;
  };
  onLogout: () => void;
}

export default function Navbar({ user, onLogout }: NavbarProps) {
  const nav = useNavigate();
  return (
    <nav className="w-full py-4 px-8 bg-gray-900/80 backdrop-blur-md fixed top-0 left-0 z-50 border-b border-gray-700/50">
      <div className="max-w-7xl mx-auto flex justify-between items-center">
        {/* Logo */}
        <div
          className="flex items-center gap-2 cursor-pointer"
          onClick={() => nav("/demo")}
        >
          <div className="p-2 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg">
            <Camera className="w-6 h-6 text-white" />
          </div>
          <span className="text-2xl font-bold text-cyan-400 tracking-wide">
            Shomer
          </span>
        </div>

        {/* Navigation + User Info */}
        <div className="flex items-center gap-6">
          <ul className="hidden md:flex gap-6 text-gray-300">
            <li
              className="hover:text-white transition cursor-pointer flex items-center gap-1"
              onClick={() => nav("/demo")}
            >
              <Home size={16} /> Dashboard
            </li>
            <li className="hover:text-white transition cursor-pointer flex items-center gap-1">
              <Book size={16} /> Relatórios
              <span className="text-xs text-gray-300 ml-1">
                (em desenvolvimento)
              </span>
            </li>
            <li className="hover:text-white transition cursor-pointer flex items-center gap-1">
              <Code2 size={16} />
              <a
                href="https://github.com/JV-L0pes/Shomer"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-cyan-400 transition-colors"
              >
                GitHub
              </a>
            </li>
          </ul>

          <div className="flex items-center gap-3 pl-6 border-l border-gray-700">
            {/* User Info */}
            <div className="hidden sm:flex items-center gap-2">
              <div className="p-2 bg-gray-700/50 rounded-lg">
                <UserIcon className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="text-right">
                <div className="text-xs text-gray-400">Bem-vindo,</div>
                <div className="text-sm font-semibold text-cyan-400">
                  {user.username}
                </div>
              </div>
            </div>

            {/* Logout Button */}
            <button
              onClick={onLogout}
              className="group p-2 bg-red-600/20 hover:bg-red-600/40 text-red-400 hover:text-red-300 rounded-lg transition-all duration-300 border border-red-600/30 hover:border-red-500/50"
              title="Sair do Sistema"
            >
              <LogOut className="w-4 h-4 group-hover:scale-110 transition-transform" />
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}

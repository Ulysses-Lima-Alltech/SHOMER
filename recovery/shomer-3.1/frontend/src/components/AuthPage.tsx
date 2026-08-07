import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Eye,
  EyeOff,
  User,
  Mail,
  Lock,
  ArrowRight,
  Shield,
  Camera,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import jwtDecode from "jwt-decode";
import { registerApi, loginApi } from "../api";

interface FormData {
  username: string; // Pode ser username ou email no login
  email: string;
  password: string;
  confirmPassword: string;
  invitationToken: string;
}

interface FormErrors {
  username?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  invitationToken?: string;
  general?: string;
}

type DecodedToken = {
  sub: string;
  exp: number;
};

interface AuthPageProps {
  onLogin?: (user: {
    id: string;
    username: string;
    email: string;
    createdAt: string;
  }) => void;
}

export default function AuthPage({ onLogin }: AuthPageProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
    invitationToken: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const navigate = useNavigate();

  const validateField = (field: keyof FormData, value: string): string => {
    switch (field) {
      case "username":
        if (!value) return "Usuário ou email é obrigatório";
        if (!isLogin) {
          if (value.length < 3) return "Nome deve ter pelo menos 3 caracteres";
          if (!value.includes(' ')) return "Nome deve incluir sobrenome (ex: João Silva)";
          const parts = value.trim().split(' ');
          if (parts.length < 2) return "Nome deve incluir sobrenome (ex: João Silva)";
          for (const part of parts) {
            if (part.length < 2) return "Cada parte do nome deve ter pelo menos 2 caracteres";
          }
        }
        return "";
      case "email":
        if (!value) return "Email é obrigatório";
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "Email inválido";
        return "";
      case "password":
        if (!value) return "Senha é obrigatória";
        if (value.length < 6) return "Mínimo 6 caracteres";
        return "";
      case "confirmPassword":
        if (!isLogin && value !== formData.password)
          return "Senhas não coincidem";
        return "";
      case "invitationToken":
        if (!isLogin && !value) return "Token de convite é obrigatório";
        return "";
      default:
        return "";
    }
  };

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    const error = validateField(field, value);
    setErrors((prev) => ({ ...prev, [field]: error }));
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};
    if (isLogin) {
      // Para login, aceita username ou email
      if (!formData.username) {
        newErrors.username = "Usuário ou email é obrigatório";
      }
      newErrors.password = validateField("password", formData.password);
    } else {
      newErrors.username = validateField("username", formData.username);
      newErrors.email = validateField("email", formData.email);
      newErrors.password = validateField("password", formData.password);
      newErrors.confirmPassword = validateField(
        "confirmPassword",
        formData.confirmPassword
      );
      newErrors.invitationToken = validateField(
        "invitationToken",
        formData.invitationToken
      );
    }
    Object.keys(newErrors).forEach((key) => {
      if (!newErrors[key as keyof FormErrors])
        delete newErrors[key as keyof FormErrors];
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;
    setIsLoading(true);
    setErrors({});
    try {
      if (isLogin) {
        const response = await loginApi({
          username: formData.username,
          password: formData.password,
        });
        // response contains access_token and user
        const { access_token, user } = response;
        localStorage.setItem("authToken", access_token);
        sessionStorage.setItem("shomer_user", JSON.stringify(user));

        // Chamar onLogin se fornecido
        if (onLogin) {
          onLogin(user);
        }
      } else {
        await registerApi({
          username: formData.username,
          email: formData.email,
          password: formData.password,
          invitationToken: formData.invitationToken,
        });
        setIsLogin(true);
        setFormData({ ...formData, confirmPassword: "", invitationToken: "" });
        return;
      }
      navigate("/demo");
    } catch (err: any) {
      let errorMessage = "Erro interno. Tente novamente.";
      if (err?.response?.data?.detail) {
        const d = err.response.data.detail;
        errorMessage = Array.isArray(d)
          ? d.map((e: any) => e.msg || e.message || String(e)).join(", ")
          : d;
      } else if (err?.message) {
        errorMessage = err.message;
      }
      setErrors({ general: errorMessage });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-[#020617] to-[#0f172a] flex items-center justify-center p-4">
      <motion.div
        className="w-full max-w-md"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Header */}
        <div className="text-center mb-8">
          <motion.div
            className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl mb-4"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Camera className="w-8 h-8 text-white" />
          </motion.div>
          <h1 className="text-3xl font-bold text-white mb-2">
            {isLogin ? "Entrar no Shomer" : "Criar Conta"}
          </h1>
          <p className="text-gray-400">
            {isLogin
              ? "Acesse sua conta para continuar"
              : "Preencha os dados para se registrar"}
          </p>
        </div>

        {/* Form */}
        <motion.div
          className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-2xl p-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
          >
            <div className="space-y-4">
              {/* Username Field */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  {isLogin ? "Usuário ou Email" : "Nome de Usuário"}
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) =>
                      handleInputChange("username", e.target.value)
                    }
                    className="w-full pl-10 pr-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                    placeholder={
                      isLogin
                        ? "Digite seu usuário ou email"
                        : "Digite seu nome de usuário"
                    }
                  />
                </div>
                {errors.username && (
                  <p className="text-red-400 text-sm mt-1">{errors.username}</p>
                )}
              </div>

              {/* Email Field (only for register) */}
              {!isLogin && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) =>
                        handleInputChange("email", e.target.value)
                      }
                      className="w-full pl-10 pr-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                      placeholder="Digite seu email"
                    />
                  </div>
                  {errors.email && (
                    <p className="text-red-400 text-sm mt-1">{errors.email}</p>
                  )}
                </div>
              )}

              {/* Password Field */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Senha
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={formData.password}
                    onChange={(e) =>
                      handleInputChange("password", e.target.value)
                    }
                    className="w-full pl-10 pr-10 py-3 bg-gray-800/50 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                    placeholder="Digite sua senha"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-red-400 text-sm mt-1">{errors.password}</p>
                )}
              </div>

              {/* Confirm Password Field (only for register) */}
              {!isLogin && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Confirmar Senha
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      value={formData.confirmPassword}
                      onChange={(e) =>
                        handleInputChange("confirmPassword", e.target.value)
                      }
                      className="w-full pl-10 pr-10 py-3 bg-gray-800/50 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                      placeholder="Confirme sua senha"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setShowConfirmPassword(!showConfirmPassword)
                      }
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  {errors.confirmPassword && (
                    <p className="text-red-400 text-sm mt-1">
                      {errors.confirmPassword}
                    </p>
                  )}
                </div>
              )}

              {/* Invitation Token Field (only for register) */}
              {!isLogin && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Token de Convite
                  </label>
                  <div className="relative">
                    <Shield className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input
                      type="text"
                      value={formData.invitationToken}
                      onChange={(e) =>
                        handleInputChange("invitationToken", e.target.value)
                      }
                      className="w-full pl-10 pr-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                      placeholder="Digite o token de convite"
                    />
                  </div>
                  {errors.invitationToken && (
                    <p className="text-red-400 text-sm mt-1">
                      {errors.invitationToken}
                    </p>
                  )}
                </div>
              )}

              {/* General Error */}
              {errors.general && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                  <p className="text-red-400 text-sm">{errors.general}</p>
                </div>
              )}

              {/* Submit Button */}
              <motion.button
                disabled={isLoading}
                className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:from-cyan-600 hover:to-blue-700 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-gray-900 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    {isLogin ? "Entrar" : "Criar Conta"}
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </motion.button>
            </div>
          </form>

          {/* Toggle Login/Register */}
          <div className="mt-6 text-center">
            <button
              onClick={() => {
                setIsLogin(!isLogin);
                setErrors({});
                setFormData({
                  username: "",
                  email: "",
                  password: "",
                  confirmPassword: "",
                  invitationToken: "",
                });
              }}
              className="text-cyan-400 hover:text-cyan-300 transition-colors text-sm"
            >
              {isLogin
                ? "Não tem uma conta? Criar conta"
                : "Já tem uma conta? Fazer login"}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}

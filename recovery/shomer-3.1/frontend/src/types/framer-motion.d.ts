declare module "framer-motion" {
  import { ComponentType, ReactNode } from "react";

  export interface MotionProps {
    initial?: any;
    animate?: any;
    exit?: any;
    transition?: any;
    whileHover?: any;
    whileTap?: any;
    whileInView?: any;
    viewport?: any;
    className?: string;
    children?: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    href?: string;
  }

  export const motion: {
    div: ComponentType<MotionProps>;
    button: ComponentType<MotionProps>;
    span: ComponentType<MotionProps>;
    p: ComponentType<MotionProps>;
    h1: ComponentType<MotionProps>;
    h2: ComponentType<MotionProps>;
    h3: ComponentType<MotionProps>;
    a: ComponentType<MotionProps>;
    [key: string]: ComponentType<MotionProps>;
  };

  export const AnimatePresence: ComponentType<{
    children?: ReactNode;
  }>;
}

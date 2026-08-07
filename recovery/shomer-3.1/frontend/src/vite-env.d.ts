/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  // adicione aqui outras variáveis que você use, ex:
  // readonly VITE_OTHER_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

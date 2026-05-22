// src/supabase.js
// ─────────────────────────────────────────────────────────────
// INSTRUCCIONES:
// 1. Abrí tu proyecto en supabase.com
// 2. Andá a Project Settings → API
// 3. Copiá "Project URL" y pegala en VITE_SUPABASE_URL
// 4. Copiá "anon public" key y pegala en VITE_SUPABASE_ANON_KEY
// 5. Guardá esos valores en el archivo .env (ver abajo)
// ─────────────────────────────────────────────────────────────
// Creá un archivo llamado ".env" en la raíz del proyecto con:
//
//   VITE_SUPABASE_URL=https://tuproyecto.supabase.co
//   VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5c...
//
// NUNCA subas el archivo .env a GitHub (ya está en .gitignore)
// ─────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey  = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Faltan las variables de entorno VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY. " +
    "Creá el archivo .env en la raíz del proyecto."
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey);

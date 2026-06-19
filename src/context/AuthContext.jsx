import { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../supabase";

const AuthContext = createContext(null);

const INACTIVITY_MS = 4 * 60 * 60 * 1000; // 4 horas
const ACTIVITY_EVENTS = ["mousemove", "keydown", "click", "touchstart", "scroll"];

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [staffProfile, setStaffProfile] = useState(null);
  const [isRecovery, setIsRecovery] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const inactivityTimer = useRef(null);

  const doSignOut = useCallback(() => {
    supabase.auth.signOut().then(() => {
      setStaffProfile(null);
      setSession(null);
    });
  }, []);

  const resetTimer = useCallback(() => {
    clearTimeout(inactivityTimer.current);
    inactivityTimer.current = setTimeout(doSignOut, INACTIVITY_MS);
  }, [doSignOut]);

  // Arranca/para el tracker de inactividad según si hay sesión activa
  useEffect(() => {
    if (!session) {
      clearTimeout(inactivityTimer.current);
      ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, resetTimer));
      return;
    }
    ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, resetTimer, { passive: true }));
    resetTimer();
    return () => {
      clearTimeout(inactivityTimer.current);
      ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, resetTimer));
    };
  }, [session, resetTimer]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) {
        supabase
          .from("staff")
          .select("*")
          .eq("user_id", data.session.user.id)
          .then(({ data: staff }) => {
            if (staff && staff[0]) setStaffProfile(staff[0]);
            setAuthLoading(false);
          });
      } else {
        setAuthLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (_e === "PASSWORD_RECOVERY") setIsRecovery(true);
      setSession(session);
      if (session?.user?.id) {
        supabase
          .from("staff")
          .select("*")
          .eq("user_id", session.user.id)
          .then(({ data: staff }) => {
            if (staff && staff[0]) setStaffProfile(staff[0]);
          });
      } else {
        setStaffProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  function signIn(email, password) {
    return supabase.auth.signInWithPassword({ email, password }).then(({ data, error }) => {
      if (error) throw error;
      return data;
    });
  }

  function signOut() {
    clearTimeout(inactivityTimer.current);
    return supabase.auth.signOut().then(() => {
      setStaffProfile(null);
      setSession(null);
    });
  }

  return (
    <AuthContext.Provider value={{
      session,
      staffProfile,
      loading: authLoading,
      isAdmin:  staffProfile?.role === "admin",
      isViewer: staffProfile?.role === "viewer" || !!staffProfile?.is_admin_viewer,
      isRecovery,
      signIn,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

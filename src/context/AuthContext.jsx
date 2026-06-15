import { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "../supabase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [staffProfile, setStaffProfile] = useState(null);
  const [isRecovery, setIsRecovery] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

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
      isAdmin: staffProfile?.role === "admin",
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

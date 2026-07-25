import { useEffect, useState } from "react";
import {
  AuthApiError,
  createAuthClient,
  type AuthUserResponse,
} from "./api/authClient";
import {
  loadStoredSession,
  logoutAndClearSession,
  refreshStoredSession,
} from "./auth/sessionStorage";
import { loadStoredConfig } from "./config/storage";
import { AuthScreen } from "./features/auth/AuthScreen";
import { GlassChatApp } from "./features/glassChatV2/GlassChatApp";

export function App() {
  return <StandaloneApp />;
}

type SessionState =
  | { status: "checking"; user: null; message: string }
  | { status: "unauthenticated"; user: null; message: string }
  | { status: "authenticated"; user: AuthUserResponse; message: string }
  | { status: "error"; user: null; message: string };

function StandaloneApp() {
  const [sessionState, setSessionState] = useState<SessionState>(() =>
    loadStoredSession()
      ? { status: "checking", user: null, message: "Loading your account…" }
      : { status: "unauthenticated", user: null, message: "" },
  );
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    if (sessionState.status === "checking") {
      void loadCurrentUser();
    }
  }, []);

  async function loadCurrentUser() {
    const session = loadStoredSession();
    if (!session) {
      setSessionState({ status: "unauthenticated", user: null, message: "" });
      return;
    }

    setSessionState({
      status: "checking",
      user: null,
      message: "Loading your account…",
    });
    const authClient = createAuthClient(loadStoredConfig());
    try {
      let accessToken = session.accessToken;
      let user: AuthUserResponse;
      try {
        user = await authClient.getMe(accessToken);
      } catch (error) {
        if (!(error instanceof AuthApiError) || error.status !== 401) {
          throw error;
        }
        const refreshedSession = await refreshStoredSession(authClient);
        accessToken = refreshedSession.accessToken;
        user = await authClient.getMe(accessToken);
      }
      setSessionState({
        status: "authenticated",
        user,
        message: "",
      });
    } catch (error) {
      setSessionState({
        status: "error",
        user: null,
        message:
          error instanceof Error
            ? error.message
            : "We could not load your messaging account.",
      });
    }
  }

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      await logoutAndClearSession(createAuthClient(loadStoredConfig()));
    } catch {
      // Local session clearing is guaranteed by the lifecycle helper.
    } finally {
      setSessionState({ status: "unauthenticated", user: null, message: "" });
      setIsLoggingOut(false);
    }
  }

  if (sessionState.status === "unauthenticated") {
    return (
      <AuthScreen
        onAuthenticated={(user) =>
          setSessionState({ status: "authenticated", user, message: "" })
        }
      />
    );
  }

  if (sessionState.status === "checking" || sessionState.status === "error") {
    return (
      <main className="session-gate">
        <section className="session-gate__card">
          <p className="eyebrow">Betopia messaging</p>
          <h1>
            {sessionState.status === "checking"
              ? "Opening your chat"
              : "Your session needs attention"}
          </h1>
          <p role={sessionState.status === "error" ? "alert" : "status"}>
            {sessionState.message}
          </p>
          {sessionState.status === "error" ? (
            <div className="button-row">
              <button type="button" onClick={() => void loadCurrentUser()}>
                Try again
              </button>
              <button type="button" onClick={() => void handleLogout()}>
                Sign out
              </button>
            </div>
          ) : null}
        </section>
      </main>
    );
  }

  return (
    <div className="authenticated-app">
      <header className="authenticated-header">
        <div>
          <p className="eyebrow">Betopia messaging</p>
          <strong>{sessionState.user.display_name}</strong>
          <span>{sessionState.user.email ?? sessionState.user.user_id}</span>
        </div>
        <button
          type="button"
          onClick={() => void handleLogout()}
          disabled={isLoggingOut}
        >
          {isLoggingOut ? "Signing out…" : "Sign out"}
        </button>
      </header>
      <GlassChatApp currentUser={sessionState.user} />
    </div>
  );
}


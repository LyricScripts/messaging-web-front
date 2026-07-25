import { useState, type FormEvent } from "react";
import {
  AuthApiError,
  createAuthClient,
  type AuthUserResponse,
} from "../../api/authClient";
import {
  clearStoredSession,
  saveTokenResponse,
} from "../../auth/sessionStorage";
import { loadStoredConfig } from "../../config/storage";

type AuthMode = "login" | "register";

type AuthScreenProps = {
  onAuthenticated?: (user: AuthUserResponse) => void;
};

export function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<AuthUserResponse | null>(null);

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode);
    setErrorMessage(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setCurrentUser(null);
    setIsSubmitting(true);

    const authClient = createAuthClient(loadStoredConfig());
    try {
      const tokenResponse =
        mode === "login"
          ? await authClient.login({
              email: email.trim(),
              password,
            })
          : await authClient.register({
              display_name: displayName.trim() || undefined,
              email: email.trim(),
              password,
              username: username.trim() || undefined,
            });

      saveTokenResponse(tokenResponse);
      const user = await authClient.getMe(tokenResponse.access_token);
      setCurrentUser(user);
      setPassword("");
      onAuthenticated?.(user);
    } catch (error) {
      clearStoredSession();
      setErrorMessage(authErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-card__intro">
          <p className="eyebrow">Betopia messaging</p>
          <h1 id="auth-title">
            {mode === "login" ? "Welcome back" : "Create your account"}
          </h1>
          <p>
            {mode === "login"
              ? "Sign in with your messaging account to continue."
              : "Register an account for standalone chat."}
          </p>
        </div>

        <div className="auth-mode-switch" aria-label="Authentication mode">
          <button
            type="button"
            aria-pressed={mode === "login"}
            onClick={() => changeMode("login")}
            disabled={isSubmitting}
          >
            Sign in
          </button>
          <button
            type="button"
            aria-pressed={mode === "register"}
            onClick={() => changeMode("register")}
            disabled={isSubmitting}
          >
            Register
          </button>
        </div>

        {currentUser ? (
          <div className="auth-success" role="status">
            <strong>Signed in as {currentUser.display_name}</strong>
            <span>{currentUser.email ?? currentUser.user_id}</span>
            <a className="auth-primary-link" href="/">
              Continue to chat
            </a>
          </div>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            {mode === "register" ? (
              <>
                <label className="field">
                  <span>Display name</span>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    autoComplete="name"
                    disabled={isSubmitting}
                  />
                </label>
                <label className="field">
                  <span>Username</span>
                  <input
                    type="text"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    autoComplete="username"
                    disabled={isSubmitting}
                  />
                </label>
              </>
            ) : null}

            <label className="field">
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
                disabled={isSubmitting}
              />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                required
                disabled={isSubmitting}
              />
            </label>

            {errorMessage ? (
              <p className="auth-error" role="alert">
                {errorMessage}
              </p>
            ) : null}

            <button
              className="full-width-button"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting
                ? mode === "login"
                  ? "Signing in…"
                  : "Creating account…"
                : mode === "login"
                  ? "Sign in"
                  : "Create account"}
            </button>

          </form>
        )}
      </section>
    </main>
  );
}

function authErrorMessage(error: unknown) {
  if (error instanceof AuthApiError) {
    return error.message;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "We could not complete that request. Please try again.";
}

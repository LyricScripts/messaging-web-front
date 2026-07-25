import { useState, type FormEvent } from "react";
import {
  AuthApiError,
  createAuthClient,
  type AuthTokenResponse,
  type AuthUserResponse,
} from "../../api/authClient";
import {
  clearStoredSession,
  saveTokenResponse,
} from "../../auth/sessionStorage";
import { loadStoredConfig } from "../../config/storage";

type AuthMode = "login" | "register" | "verify";

type AuthScreenProps = {
  onAuthenticated?: (user: AuthUserResponse) => void;
};

export function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationEmail, setVerificationEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<AuthUserResponse | null>(null);

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode);
    setErrorMessage(null);
    setNoticeMessage(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === "verify") {
      await handleVerificationSubmit();
      return;
    }

    setErrorMessage(null);
    setNoticeMessage(null);
    setCurrentUser(null);
    setIsSubmitting(true);

    const authClient = createAuthClient(loadStoredConfig());
    try {
      if (mode === "register") {
        const response = await authClient.register({
          display_name: displayName.trim() || undefined,
          email: email.trim(),
          password,
        });
        setPassword("");
        setVerificationCode("");
        setVerificationEmail(email.trim());
        setMode("verify");
        setNoticeMessage(response.message);
        return;
      }

      const tokenResponse = await authClient.login({
        email: email.trim(),
        password,
      });
      await finishAuthenticatedSession(tokenResponse);
    } catch (error) {
      clearStoredSession();
      if (isVerificationRequiredError(error)) {
        setPassword("");
        setVerificationCode("");
        setVerificationEmail(email.trim());
        setMode("verify");
        setNoticeMessage("Enter the verification code sent to your email.");
      } else {
        setErrorMessage(authErrorMessage(error));
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVerificationSubmit() {
    setErrorMessage(null);
    setNoticeMessage(null);
    setCurrentUser(null);
    setIsSubmitting(true);

    const authClient = createAuthClient(loadStoredConfig());
    try {
      const tokenResponse = await authClient.verifyEmail({
        email: verificationEmail.trim() || email.trim(),
        code: verificationCode.trim(),
      });
      await finishAuthenticatedSession(tokenResponse);
    } catch (error) {
      clearStoredSession();
      setErrorMessage(authErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResendVerification() {
    const targetEmail = verificationEmail.trim() || email.trim();
    if (!targetEmail) return;

    setErrorMessage(null);
    setNoticeMessage(null);
    setIsResending(true);
    try {
      const response = await createAuthClient(
        loadStoredConfig(),
      ).resendVerification({ email: targetEmail });
      setNoticeMessage(response.message);
    } catch (error) {
      setErrorMessage(authErrorMessage(error));
    } finally {
      setIsResending(false);
    }
  }

  async function finishAuthenticatedSession(tokenResponse: AuthTokenResponse) {
    const authClient = createAuthClient(loadStoredConfig());
    saveTokenResponse(tokenResponse);
    const user = await authClient.getMe(tokenResponse.access_token);
    setCurrentUser(user);
    setPassword("");
    setVerificationCode("");
    onAuthenticated?.(user);
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-card__intro">
          <p className="eyebrow">Betopia messaging</p>
          <h1 id="auth-title">
            {mode === "login"
              ? "Welcome back"
              : mode === "register"
                ? "Create your account"
                : "Verify your email"}
          </h1>
          <p>
            {mode === "login"
              ? "Sign in with your messaging account to continue."
              : mode === "register"
                ? "Register an account for standalone chat."
                : "Enter the code sent to your email to continue."}
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

        {noticeMessage ? (
          <p className="auth-notice" role="status">
            {noticeMessage}
          </p>
        ) : null}

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
              </>
            ) : null}

            {mode === "verify" ? (
              <>
                <label className="field">
                  <span>Email</span>
                  <input
                    type="email"
                    value={verificationEmail || email}
                    onChange={(event) => setVerificationEmail(event.target.value)}
                    autoComplete="email"
                    required
                    disabled={isSubmitting}
                  />
                </label>
                <label className="field">
                  <span>Verification code</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={verificationCode}
                    onChange={(event) =>
                      setVerificationCode(event.target.value)
                    }
                    autoComplete="one-time-code"
                    required
                    disabled={isSubmitting}
                  />
                </label>
              </>
            ) : (
              <>
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
              </>
            )}

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
                  : mode === "register"
                    ? "Creating account…"
                    : "Verifying…"
                : mode === "login"
                  ? "Sign in"
                  : mode === "register"
                    ? "Create account"
                    : "Verify email"}
            </button>

            {mode === "verify" ? (
              <button
                className="auth-secondary-button"
                type="button"
                disabled={isSubmitting || isResending}
                onClick={() => void handleResendVerification()}
              >
                {isResending ? "Sending code…" : "Resend code"}
              </button>
            ) : null}
          </form>
        )}
      </section>
    </main>
  );
}

function isVerificationRequiredError(error: unknown) {
  return (
    error instanceof AuthApiError &&
    error.status === 403 &&
    error.code === "verification_required"
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

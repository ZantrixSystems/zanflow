import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

const MIN_DISPLAY_MS = 7000;

const STEPS = [
  'Verifying your secure sign-in link',
  'Setting up your council workspace',
  'Preparing your admin panel',
];

const STEP_TIMES = [2000, 4500];

function getCouncilInitial() {
  try {
    const sub = window.location.hostname.split('.')[0];
    if (!sub || sub === 'localhost' || sub === 'www') return 'Z';
    return sub.charAt(0).toUpperCase();
  } catch {
    return 'Z';
  }
}

export default function TenantBootstrapExchangePage() {
  const [error, setError] = useState('');
  const [step, setStep] = useState(0);
  const [councilName, setCouncilName] = useState('');
  const started = useRef(false);

  useEffect(() => {
    // Guard against React StrictMode double-invocation
    if (started.current) return;
    started.current = true;

    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');

    if (!token) {
      setError('Sign-in link is missing its token.');
      return;
    }

    let redirectTarget = null;
    let exchangeOk = false;
    let timerFired = false;
    let errorOccurred = false;

    function attemptRedirect() {
      if (exchangeOk && timerFired && redirectTarget) {
        window.location.replace(redirectTarget);
      }
    }

    // Step advance timers — pure UX, always run
    const stepTimers = STEP_TIMES.map((delay, i) =>
      setTimeout(() => setStep(i + 1), delay)
    );

    // Minimum display timer
    const minTimer = setTimeout(() => {
      timerFired = true;
      if (!errorOccurred) attemptRedirect();
    }, MIN_DISPLAY_MS);

    api.staffBootstrapExchange({ token })
      .then((data) => {
        if (data.tenant_name) setCouncilName(data.tenant_name);
        redirectTarget = '/admin/dashboard';
        exchangeOk = true;
        attemptRedirect();
      })
      .catch((err) => {
        errorOccurred = true;
        clearTimeout(minTimer);
        stepTimers.forEach(clearTimeout);
        setError(err.message || 'Sign-in failed. Please try again.');
      });

    // No cleanup — intentional. Cancelling timers on unmount would kill the
    // 7-second display if App.jsx briefly unmounts this component during
    // its tenant availability check.
  }, []);

  const initial = councilName ? councilName.charAt(0) : getCouncilInitial();
  const title = councilName ? `Setting up ${councilName}` : 'Setting up your workspace';
  const subtitle = councilName
    ? `${councilName}'s licensing portal is being prepared for you.`
    : 'Your council\u2019s licensing portal is being prepared.';

  if (error) {
    return (
      <div className="bootstrap-loading-screen">
        <span className="bootstrap-loading-brand">ZanFlo</span>
        <div className="bootstrap-loading-content">
          <div className="alert alert-error">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="bootstrap-loading-screen">
      <span className="bootstrap-loading-brand">ZanFlo</span>
      <div className="bootstrap-loading-content">
        <div className="bootstrap-loading-icon" aria-hidden="true">
          <span>{initial}</span>
        </div>
        <h1 className="bootstrap-loading-title">{title}</h1>
        <p className="bootstrap-loading-subtitle">{subtitle}</p>
        <div className="bootstrap-loading-bar-track" role="progressbar" aria-label="Loading progress">
          <div className="bootstrap-loading-bar-fill" />
        </div>
        <ul className="bootstrap-loading-steps">
          {STEPS.map((label, i) => {
            const state = i < step ? 'done' : i === step ? 'active' : 'pending';
            return (
              <li key={label} className={`bootstrap-loading-step is-${state}`}>
                <span className="bootstrap-step-icon" aria-hidden="true">
                  {state === 'done' ? '✓' : null}
                </span>
                {label}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

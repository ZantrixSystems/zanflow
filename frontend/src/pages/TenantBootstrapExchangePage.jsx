import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';

const MIN_DURATION_MS = 7000;

const STEPS = [
  'Verifying your secure sign-in link',
  'Setting up your council workspace',
  'Preparing your admin panel',
];

const STEP_ADVANCE_TIMES = [2000, 4500];

function getSlugFromHostname() {
  try {
    const sub = window.location.hostname.split('.')[0];
    if (!sub || sub === 'localhost' || sub === 'www') return '';
    return sub.charAt(0).toUpperCase() + sub.slice(1);
  } catch {
    return '';
  }
}

export default function TenantBootstrapExchangePage() {
  const [searchParams] = useSearchParams();
  const [error, setError] = useState('');
  const [step, setStep] = useState(0);
  const [councilName, setCouncilName] = useState(getSlugFromHostname);

  const navigateTarget = useRef(null);
  const exchangeDone = useRef(false);
  const timerDone = useRef(false);
  const navigated = useRef(false);
  const exchangeAttempted = useRef(false);

  useEffect(() => {
    if (exchangeAttempted.current) return;
    exchangeAttempted.current = true;

    function maybeNavigate() {
      if (exchangeDone.current && timerDone.current && !navigated.current && navigateTarget.current) {
        navigated.current = true;
        window.location.href = navigateTarget.current;
      }
    }

    const token = searchParams.get('token');
    if (!token) {
      setError('Sign-in link is missing its token.');
      return;
    }

    const stepTimers = STEP_ADVANCE_TIMES.map((delay, i) =>
      setTimeout(() => setStep(i + 1), delay)
    );

    const minTimer = setTimeout(() => {
      timerDone.current = true;
      maybeNavigate();
    }, MIN_DURATION_MS);

    api.staffBootstrapExchange({ token })
      .then((data) => {
        if (data.tenant_name) setCouncilName(data.tenant_name);
        const target = data.session?.role === 'tenant_admin' ? '/admin/dashboard?welcome=1' : '/admin/dashboard';
        navigateTarget.current = target;
        exchangeDone.current = true;
        maybeNavigate();
      })
      .catch((err) => {
        clearTimeout(minTimer);
        stepTimers.forEach(clearTimeout);
        setError(err.message || 'Sign-in failed. Please try again.');
      });

    return () => {
      clearTimeout(minTimer);
      stepTimers.forEach(clearTimeout);
    };
  }, []);

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
          <span>{councilName ? councilName.charAt(0) : 'Z'}</span>
        </div>
        <h1 className="bootstrap-loading-title">
          {councilName ? `Setting up ${councilName}` : 'Setting up your workspace'}
        </h1>
        <p className="bootstrap-loading-subtitle">
          {councilName
            ? `${councilName}'s licensing portal is being prepared for you.`
            : 'Your council\u2019s licensing portal is being prepared.'}
        </p>
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

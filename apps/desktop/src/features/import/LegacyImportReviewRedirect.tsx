import { Navigate, useLocation } from 'react-router';

export function LegacyImportReviewRedirect() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const step = params.get('step');
  if (step === 'account') {
    return <Navigate to="/accounts" replace />;
  }
  if (step === 'position') params.set('method', 'manual');
  if (step === 'screenshot') params.set('method', 'screenshot');
  const search = params.toString();
  return (
    <Navigate
      to={{ pathname: '/position-entry', ...(search ? { search: `?${search}` } : {}) }}
      replace
    />
  );
}

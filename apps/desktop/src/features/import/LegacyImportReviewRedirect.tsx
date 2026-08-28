import { Navigate, useLocation } from 'react-router';

export function LegacyImportReviewRedirect() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const step = params.get('step');
  if (step === 'account') params.set('setup', '1');
  else if (step === 'screenshot' || params.get('method') === 'screenshot') {
    params.set('tab', 'positions');
    params.set('entry', 'screenshot');
  } else params.set('tab', 'positions');
  params.delete('step');
  params.delete('method');
  const search = params.toString();
  return (
    <Navigate to={{ pathname: '/accounts', ...(search ? { search: `?${search}` } : {}) }} replace />
  );
}

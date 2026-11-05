import { MobileProviders } from './app/MobileRuntime';
import { MobileNavigation } from './app/MobileNavigation';

export function MobileApp() {
  return <MobileProviders><MobileNavigation /></MobileProviders>;
}

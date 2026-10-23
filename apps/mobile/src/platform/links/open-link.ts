import { Linking } from 'react-native';
import { safeExternalUrl } from './external-url';
export async function openExternalLink(value: string, allowedHosts?: readonly string[]) {
  await Linking.openURL(safeExternalUrl(value, allowedHosts));
}
